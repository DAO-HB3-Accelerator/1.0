const { HNSWLib } = require('langchain/vectorstores/hnswlib');
const { OllamaEmbeddings } = require('langchain/embeddings/ollama');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { DirectoryLoader } = require('langchain/document_loaders/fs/directory');
const { TextLoader } = require('langchain/document_loaders/fs/text');
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const fs = require('fs');
const path = require('path');

// Путь к директории для хранения векторной базы данных
const VECTOR_STORE_PATH = path.join(__dirname, '../data/vector_store');

// Инициализация embeddings с использованием локальной модели Ollama
const embeddings = new OllamaEmbeddings({
  model: process.env.OLLAMA_EMBEDDINGS_MODEL || 'mistral',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
});

let vectorStore = null;

/**
 * Инициализация векторного хранилища
 */
async function initializeVectorStore() {
  try {
    // Создание директории, если она не существует
    if (!fs.existsSync(VECTOR_STORE_PATH)) {
      fs.mkdirSync(VECTOR_STORE_PATH, { recursive: true });
      console.log(`Created vector store directory at ${VECTOR_STORE_PATH}`);
    }

    // Проверка наличия файлов индекса
    const indexFiles = fs.readdirSync(VECTOR_STORE_PATH);

    if (indexFiles.length > 0 && indexFiles.includes('hnswlib.index')) {
      // Загрузка существующего индекса
      console.log('Loading existing vector store...');
      try {
        vectorStore = await HNSWLib.load(VECTOR_STORE_PATH, embeddings);
        console.log('Vector store loaded successfully');
      } catch (loadError) {
        console.error('Error loading existing vector store:', loadError);
        console.log('Creating new vector store...');
        await createVectorStore();
      }
    } else {
      // Создание нового индекса
      console.log('Creating new vector store...');
      await createVectorStore();
    }

    return vectorStore;
  } catch (error) {
    console.error('Error initializing vector store:', error);
    // Создаем пустой векторный индекс в случае ошибки
    vectorStore = new HNSWLib(embeddings, {
      space: 'cosine',
      numDimensions: 4096, // Размерность для Ollama embeddings (зависит от модели)
    });
    await vectorStore.save(VECTOR_STORE_PATH);
    return vectorStore;
  }
}

/**
 * Создание нового векторного хранилища из документов
 */
async function createVectorStore() {
  try {
    // Проверяем наличие директории documents
    const docsPath = path.join(__dirname, '../data/documents');

    // Если директория documents не существует, проверяем директорию docs
    if (!fs.existsSync(docsPath)) {
      const altDocsPath = path.join(__dirname, '../data/docs');

      // Если директория docs существует, используем ее
      if (fs.existsSync(altDocsPath)) {
        console.log(`Using documents directory at ${altDocsPath}`);
        return await processDocumentsDirectory(altDocsPath);
      }

      // Иначе создаем директорию documents
      fs.mkdirSync(docsPath, { recursive: true });
      console.log(`Created documents directory at ${docsPath}`);

      // Создание примера документа
      const sampleDocPath = path.join(docsPath, 'sample.txt');
      fs.writeFileSync(sampleDocPath, 'Это пример документа для векторного хранилища.');
    }

    return await processDocumentsDirectory(docsPath);
  } catch (error) {
    console.error('Error creating vector store:', error);
    throw error;
  }
}

/**
 * Обработка директории с документами
 * @param {string} docsPath - Путь к директории с документами
 */
async function processDocumentsDirectory(docsPath) {
  try {
    // Загрузка документов
    const loader = new DirectoryLoader(docsPath, {
      '.txt': (path) => new TextLoader(path),
      '.pdf': (path) => new PDFLoader(path),
    });

    const docs = await loader.load();
    console.log(`Loaded ${docs.length} documents`);

    if (docs.length === 0) {
      // Создаем пустой векторный индекс, если нет документов
      vectorStore = new HNSWLib(embeddings, {
        space: 'cosine',
        numDimensions: 4096, // Размерность для Ollama embeddings (зависит от модели)
      });
    } else {
      // Разделение документов на чанки
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Split into ${splitDocs.length} chunks`);

      // Создание векторного хранилища
      vectorStore = await HNSWLib.fromDocuments(splitDocs, embeddings);
    }

    // Сохранение векторного хранилища
    await vectorStore.save(VECTOR_STORE_PATH);
    console.log('Vector store created and saved successfully');

    return vectorStore;
  } catch (error) {
    console.error('Error processing documents directory:', error);
    throw error;
  }
}

/**
 * Получение векторного хранилища
 * @returns {HNSWLib|null} Векторное хранилище
 */
function getVectorStore() {
  return vectorStore;
}

/**
 * Поиск похожих документов
 * @param {string} query - Запрос для поиска
 * @param {number} k - Количество результатов
 * @returns {Promise<Array>} - Массив похожих документов
 */
async function similaritySearch(query, k = 5) {
  if (!vectorStore) {
    await initializeVectorStore();
  }

  try {
    const results = await vectorStore.similaritySearch(query, k);
    return results;
  } catch (error) {
    console.error('Error performing similarity search:', error);
    return [];
  }
}

/**
 * Добавление нового документа в векторное хранилище
 * @param {string} text - Текст документа
 * @param {Object} metadata - Метаданные документа
 * @returns {Promise<boolean>} - Успешность добавления
 */
async function addDocument(text, metadata = {}) {
  if (!vectorStore) {
    await initializeVectorStore();
  }

  try {
    // Разделение документа на чанки
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.createDocuments([text], [metadata]);

    // Добавление документов в векторное хранилище
    await vectorStore.addDocuments(docs);

    // Сохранение обновленного векторного хранилища
    await vectorStore.save(VECTOR_STORE_PATH);

    console.log('Document added to vector store successfully');
    return true;
  } catch (error) {
    console.error('Error adding document to vector store:', error);
    return false;
  }
}

module.exports = {
  initializeVectorStore,
  getVectorStore,
  similaritySearch,
  addDocument,
};

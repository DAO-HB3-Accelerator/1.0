import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia } from '@reown/appkit/networks'

export const projectId = '9a6515f7259ebccd149fd53341e01e6b'

export const networks = [sepolia]

export const ethersAdapter = new EthersAdapter()
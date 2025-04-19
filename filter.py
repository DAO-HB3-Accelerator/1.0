#!/usr/bin/env python3
import re

def callback(blob, callback_metadata):
    data = blob.data
    data = re.sub(rb"7de38b2ada1d23581342f106c8587ce26068797b3bc06656e24b9dcd1810c7b1", b"***REMOVED-PRIVATE-KEY***", data)
    data = re.sub(rb"T9T84CNEA9UQ1MUF85B83HK4REJE1K95F2", b"***REMOVED-ETHERSCAN-KEY***", data)
    data = re.sub(rb"7498026249:AAGpLexl__WTigpeX-EIacAL4uwytfkf6dY", b"***REMOVED-TELEGRAM-TOKEN***", data)
    data = re.sub(rb"hb3atoken", b"***REMOVED-SESSION-SECRET***", data)
    data = re.sub(rb"dapp_password", b"***REMOVED-DB-PASSWORD***", data)
    blob.data = data


"""CryptoJS.AES-compatible encrypt/decrypt.

Matches the OpenSSL 'Salted__' format used by CryptoJS.AES.encrypt(plaintext, passphrase):
  base64( b"Salted__" + salt(8) + AES-256-CBC(ciphertext) )
Key + IV derived via EVP_BytesToKey with MD5, 1 iteration, 48 bytes total (32 key + 16 IV).
"""

import base64
import hashlib
import os

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad


def _evp_bytes_to_key(passphrase: bytes, salt: bytes, key_len: int = 32, iv_len: int = 16):
    dt = b""
    out = b""
    while len(out) < key_len + iv_len:
        dt = hashlib.md5(dt + passphrase + salt).digest()
        out += dt
    return out[:key_len], out[key_len:key_len + iv_len]


def encrypt(plaintext: str, passphrase: str) -> str:
    salt = os.urandom(8)
    key, iv = _evp_bytes_to_key(passphrase.encode("utf-8"), salt)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    ct = cipher.encrypt(pad(plaintext.encode("utf-8"), AES.block_size))
    return base64.b64encode(b"Salted__" + salt + ct).decode("ascii")


def decrypt(ciphertext_b64: str, passphrase: str) -> str:
    raw = base64.b64decode(ciphertext_b64)
    assert raw[:8] == b"Salted__", "not a CryptoJS OpenSSL-format ciphertext"
    salt = raw[8:16]
    ct = raw[16:]
    key, iv = _evp_bytes_to_key(passphrase.encode("utf-8"), salt)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return unpad(cipher.decrypt(ct), AES.block_size).decode("utf-8")


if __name__ == "__main__":
    sample = encrypt("hello world", "TEST-FOOD-CAFE")
    print(sample)
    print(decrypt(sample, "TEST-FOOD-CAFE"))

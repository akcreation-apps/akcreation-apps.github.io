# logger.py
import json
import sys
from datetime import datetime

status = {
    "timestamp": datetime.now().strftime("%d %b %Y, %I:%M %p"),
    "message": sys.argv[1] if len(sys.argv) > 1 else "No message provided",
    "status": "Success"
}

with open("status.json", "w") as f:
    json.dump(status, f)

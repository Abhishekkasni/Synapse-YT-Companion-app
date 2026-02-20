# main.py (Root Folder)
import uvicorn
import os
import sys
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

def main():
    # ADD THIS LINE: It tells Python to look in the current folder for modules
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    
    uvicorn.run("app.app:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
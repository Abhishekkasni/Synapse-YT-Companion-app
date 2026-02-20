import uvicorn
import os
import sys
from dotenv import load_dotenv

load_dotenv()


def main():
    sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
    uvicorn.run("app.app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()

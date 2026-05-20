from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI(title="Zara-Rayne - Galactic Stranded Edition")

@app.get("/")
async def root():
    with open("frontend/index.html", "r") as f:
        return HTMLResponse(f.read())

app.mount("/static", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)

from fastapi import FastAPI, UploadFile, File, Form
import whisper, tempfile, os

app = FastAPI()
model = whisper.load_model("base.en")

@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...), model_name: str = Form(default="base.en", alias="model")):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = model.transcribe(tmp_path)
        return {"text": result["text"].strip()}
    finally:
        os.unlink(tmp_path)

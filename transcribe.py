import sys
from faster_whisper import WhisperModel
f=sys.argv[1]
model=WhisperModel('small',device='cpu',compute_type='int8')
segments,info=model.transcribe(f,language='pt',vad_filter=True)
print(' '.join(s.text.strip() for s in segments).strip())

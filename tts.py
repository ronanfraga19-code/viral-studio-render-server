import asyncio,sys,edge_tts,os

text=sys.argv[1] if len(sys.argv)>1 else ""
out=sys.argv[2]
voices=[
    ("pt-BR-FranciscaNeural","+3%","+0Hz"),
    ("pt-BR-BrendaNeural","+2%","+0Hz"),
    ("pt-BR-AntonioNeural","+3%","+0Hz"),
    ("pt-BR-DonatoNeural","+2%","+0Hz"),
]

async def try_voice(v,rate,pitch):
    await edge_tts.Communicate(text,v,rate=rate,pitch=pitch).save(out)
    return os.path.exists(out) and os.path.getsize(out)>512

async def main():
    last=None
    for v,rate,pitch in voices:
        try:
            if os.path.exists(out):
                try: os.remove(out)
                except: pass
            ok=await try_voice(v,rate,pitch)
            if ok:
                return
        except Exception as e:
            last=e
    raise last or RuntimeError("Falha ao gerar voz")

asyncio.run(main())

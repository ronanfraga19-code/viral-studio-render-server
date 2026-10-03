import asyncio,sys,edge_tts
text=sys.argv[1] if len(sys.argv)>1 else ""
out=sys.argv[2]
async def main():
    voice="pt-BR-FranciscaNeural"
    await edge_tts.Communicate(text,voice,rate="+3%",pitch="+0Hz").save(out)
asyncio.run(main())

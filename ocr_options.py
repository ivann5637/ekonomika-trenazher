import json, re
from pathlib import Path
import cv2, numpy as np, easyocr

root=Path(__file__).resolve().parent
path=root/'questions.json'
questions=json.loads(path.read_text(encoding='utf-8'))
reader=easyocr.Reader(['ru','en'],gpu=False)
cache={}
for q in questions:
    source=q['source']['image']
    if not source: continue
    if source not in cache:
        im=cv2.imdecode(np.fromfile(root/'source-images'/source,dtype=np.uint8),cv2.IMREAD_COLOR)
        h,w=im.shape[:2]
        gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
        ys=np.where((gray[:,8:w-8]<240).sum(axis=1)>.65*(w-16))[0]
        groups=[]
        for y in ys:
            if not groups or y>groups[-1][-1]+2: groups.append([int(y)])
            else: groups[-1].append(int(y))
        borders=[round(sum(g)/len(g)) for g in groups]
        rows=[(borders[i],borders[i+1]) for i in range(0,len(borders),2)]
        found=reader.readtext(im,detail=1,paragraph=False)
        texts=[]
        for top,bottom in rows:
            bits=[]
            for box,value,confidence in found:
                cy=sum(p[1] for p in box)/4
                if top<cy<bottom:
                    bits.append((cy,min(p[0] for p in box),value,confidence))
            bits.sort()
            lines=[]
            for bit in bits:
                if not lines or bit[0]-lines[-1][0][0]>10: lines.append([bit])
                else: lines[-1].append(bit)
            ordered=[bit for line in lines for bit in sorted(line,key=lambda item:item[1])]
            texts.append((' '.join(x[2] for x in ordered).strip(),min((x[3] for x in ordered),default=0)))
        cache[source]=texts
    indexed=0
    for option in q['options']:
        if 'image' not in option: continue
        value,confidence=cache[source][indexed]
        option['text']=value
        option['ocr_confidence']=round(float(confidence),3)
        indexed+=1
    if q['id']=='m2-image11':
        q['options'][0]['text']='Да'
        q['options'][0]['ocr_confidence']=1
    print(source,indexed,flush=True)
path.write_text(json.dumps(questions,ensure_ascii=False,indent=2),encoding='utf-8')
print('DONE',flush=True)

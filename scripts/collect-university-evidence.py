import concurrent.futures, hashlib, json, re, subprocess, sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone
from lxml import html

ROOT=Path('tmp/directory-review'); ROOT.mkdir(exist_ok=True)
rows=json.loads(Path('data-sources/moscow/universities.json').read_text(encoding='utf-8'))['universities']
PARSE_ONLY='--parse-only' in sys.argv
def clean(s): return ' '.join(s.split())
def get(url,path):
    meta=path.with_suffix('.meta.json')
    if path.exists() and meta.exists():
        cached=json.loads(meta.read_text(encoding='utf-8'));cached['httpStatus']=cached['httpStatus'].strip();return cached
    if PARSE_ONLY:return {'httpStatus':'000','exitCode':0,'requestedUrl':url}
    run=subprocess.run(['curl.exe','-sS','-L','--max-time','16','--connect-timeout','6','--proto','=http,https','-A','Mozilla/5.0','-o',str(path),'-w','%{http_code}\n%{url_effective}',url],capture_output=True,timeout=20)
    out=[x.strip() for x in run.stdout.decode('utf-8',errors='replace').split('\n')]
    result={'requestedUrl':url,'url':out[-1] if out else url,'httpStatus':out[0] if out else '000','exitCode':run.returncode,'checkedAt':datetime.now(timezone.utc).isoformat()}
    if path.exists():result['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    meta.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');return result
def parse(path):
    raw=path.read_bytes(); encoding='windows-1251' if re.search(br'charset=["\s]*windows-1251',raw[:12000],re.I) else 'utf-8'
    return html.fromstring(raw.decode(encoding,errors='replace'))
def review(u):
    slug=u['slug']; folder=ROOT/slug;folder.mkdir(exist_ok=True)
    result={'slug':slug,'pages':{},'facts':{},'programs':[],'links':[]}
    base=u['website']; cache=Path('tmp/moscow-sites')/(u['directory']['monitoringId']+'.html')
    discovered=[]
    if cache.exists():
        try: discovered=[urljoin(base,a) for a in parse(cache).xpath('//a/@href') if 'sveden' in a.lower()]
        except Exception:pass
    for section in ['common','education','grants']:
        candidates=[x for x in discovered if '/'+section in urlparse(x).path.lower()]
        if not candidates:
            roots=[re.sub(r'/(common|education|document|struct|grants)/?.*','/',x) for x in discovered]
            candidates=[urljoin(roots[0],section+'/')] if roots else [urljoin(base,'/sveden/'+section+'/')]
        for url in dict.fromkeys(candidates[:2]):
            try:
                path=folder/(section+'.html');m=get(url,path);result['pages'][section]=m
                if m['httpStatus']!='200' or m['exitCode']:continue
                page=parse(path); visible=clean(' '.join(page.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
                if not re.search('образован|университет|институт|академи',visible,re.I) or re.search('ddos.guard|checking your browser|captcha|just a moment',visible[:2500],re.I):continue
                m['readable']=True
                if section=='common':
                    for key in ['fullName','shortName','regDate','address','telephone','email']:
                        values=list(dict.fromkeys(clean(el.text_content()) for el in page.xpath('//*[@itemprop="'+key+'"]') if clean(el.text_content())))
                        if values:result['facts'][key]={'values':values,'sourceUrl':m['url'],'checkedAt':m['checkedAt'],'sourceSha256':m['sha256']}
                if section=='grants':
                    values=list(dict.fromkeys(clean(el.text_content()) for el in page.xpath('//*[@itemprop="hostelInfo" or @itemprop="HostelInfo"]') if clean(el.text_content())))
                    if values:result['facts']['hostelInfo']={'values':values,'sourceUrl':m['url'],'checkedAt':m['checkedAt'],'sourceSha256':m['sha256']}
                for a in page.xpath('//a[@href]'):
                    label=clean(a.text_content());prop=a.get('itemprop','')
                    if re.search('licenseDocLink|accreditationDocLink',prop) or re.search('реестр.{0,20}лиценз|выпис.{0,35}лиценз',label,re.I):
                        result['links'].append({'label':label,'kind':prop,'url':urljoin(m['url'],a.get('href')),'pageUrl':m['url']})
                if section=='education':
                    for tr in page.xpath('//tr'):
                        fields={}
                        for el in tr.xpath('.//*[@itemprop]'):
                            prop=el.get('itemprop');text=clean(el.text_content())
                            if text and prop not in fields:fields[prop]=text
                        code=fields.get('eduCode','')
                        if re.fullmatch(r'\d{2}\.(?:03|05)\.\d{2}',code) and fields.get('eduName'):
                            result['programs'].append({'fields':fields,'rowType':tr.get('itemprop',''),'tableType':tr.xpath('ancestor::table')[0].get('itemprop','') if tr.xpath('ancestor::table') else '', 'sourceUrl':m['url'],'checkedAt':m['checkedAt'],'sourceSha256':m['sha256']})
                break
            except Exception as e:result['pages'][section]={'error':str(e)[:160],'requestedUrl':url}
    (folder/('parsed.json' if PARSE_ONLY else 'review.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(slug, 'facts',len(result['facts']),'programs',len(result['programs']),'documents',len(result['links']),flush=True)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(review,rows))
(ROOT/('parsed-results.json' if PARSE_ONLY else 'results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('COMPLETE',len(results),'with facts',sum(bool(x['facts']) for x in results),'program rows',sum(len(x['programs']) for x in results),flush=True)

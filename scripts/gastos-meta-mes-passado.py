import requests
import time
import socket
import json
import base64
import re
from datetime import date, timedelta, datetime
import subprocess

ADSPOWER_API = "http://127.0.0.1:50325"
PROFILE_ID = "k1dpdc9g"

SUPABASE_URL = "https://czuyzjlqliotwnzfllbe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVEJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXl6amxxbGlvdHduemZsbGJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4MTQ1MSwiZXhwIjoyMDk0MjU3NDUxfQ.dWkAVbyUm7I-PO4M_WBPENidrA4ewjrwHm-PM5LArZ8"

# Lista fixa de BMs e contas conhecidas (usada como fallback e para nomes)
BMS = [
    {"bm": "Libelula Sas", "bm_id": "354990903032853", "contas": [
        {"nome": "AN01", "id": "892566873700978"},
        {"nome": "AN02", "id": "1965775634349931"},
        {"nome": "AN03", "id": "1261463839382378"},
        {"nome": "AN04", "id": "1865764997463381"},
        {"nome": "AN05", "id": "26354801170835891"},
    ]},
    {"bm": "Billion Joy", "bm_id": "824182723681967", "contas": [
        {"nome": "JOY01", "id": "1518265519762489"},
        {"nome": "JOY02", "id": "1384432327126118"},
        {"nome": "JOY03", "id": "2459602937802129"},
    ]},
    {"bm": "Brebb tipp", "bm_id": "594210099971260", "contas": [
        {"nome": "AN01-MTH-EN", "id": "4395855227401695"},
        {"nome": "AN02-MTH-EN", "id": "3274577876045020"},
        {"nome": "AN03-MTH-FR", "id": "593914386960718"},
        {"nome": "AN04-MTH", "id": "1623991662055856"},
        {"nome": "AN05-MTH", "id": "923967406938126"},
    ]},
    {"bm": "Glitters Glow", "bm_id": "1320696028625648", "contas": [
        {"nome": "LOW-FR-02", "id": "1268585345197505"},
        {"nome": "LOW-NV-01", "id": "3465301590396813"},
        {"nome": "LOW-NV-03", "id": "1543791663377933"},
        {"nome": "LOW-NV-04", "id": "1595557708327827"},
    ]},
    {"bm": "PH Encapsulado", "bm_id": "1602331194294835", "contas": [
        {"nome": "PH01", "id": "1540878534291336"},
        {"nome": "PH02", "id": "879815705164014"},
        {"nome": "PH03", "id": "4495748577415875"},
    ]},
    {"bm": "Arigato Metals", "bm_id": "1500898508419626", "contas": [
        {"nome": "GD01", "id": "778054641905658"},
        {"nome": "GD02", "id": "1332905662025693"},
        {"nome": "GD03", "id": "27220106697607152"},
        {"nome": "GD04", "id": "27227128156903820"},
        {"nome": "GD05", "id": "741014405737819"},
    ]},
    {"bm": "Marcelo Trigo", "bm_id": "2844497955648087", "contas": [
        {"nome": "AN01", "id": "863864876420787"},
        {"nome": "INGLES02", "id": "1415757516892470"},
        {"nome": "INGLES PH", "id": "2230588854131841"},
        {"nome": "INGLES04", "id": "977757388123369"},
        {"nome": "INGLES05", "id": "2418143041996385"},
    ]},
    {"bm": "Perun Turbo", "bm_id": "3122393224558707", "contas": [
        {"nome": "ESP01", "id": "1126376728381150"},
        {"nome": "ESP02", "id": "889863130563674"},
        {"nome": "ESP03", "id": "1447156260134645"},
        {"nome": "ESP04", "id": "1624134548653338"},
        {"nome": "ESP05", "id": "786397821165710"},
    ]},
    {"bm": "PH Empresarial", "bm_id": "2032719813968731", "contas": [
        {"nome": "PH DOLAR", "id": "2511762059218845"},
    ]},
]

# --- Datas: mês anterior completo ---
hoje = date.today()
mes_ant_ultimo = hoje.replace(day=1) - timedelta(days=1)
mes_ant_primeiro = mes_ant_ultimo.replace(day=1)
data_inicio_str = mes_ant_primeiro.strftime('%Y-%m-%d')
data_fim_str = mes_ant_ultimo.strftime('%Y-%m-%d')
date_param = f"{data_inicio_str}_{data_fim_str}%2Clast_month"
print(f"Coletando gastos de: {data_inicio_str} a {data_fim_str}")

# --- Marionette helpers ---

def recv_full(sock):
    data = b""
    while b":" not in data:
        data += sock.recv(1)
    size_str, rest = data.split(b":", 1)
    total_size = int(size_str)
    while len(rest) < total_size:
        rest += sock.recv(65536)
    return rest.decode("utf-8")


def send_command(sock, command_name, params=None, msg_id=1):
    cmd = [0, msg_id, command_name, params or {}]
    msg = json.dumps(cmd)
    packet = f"{len(msg)}:{msg}"
    sock.send(packet.encode("utf-8"))
    time.sleep(0.5)
    return recv_full(sock)


def fechar_popups(sock, msg_id):
    resp = send_command(sock, "WebDriver:ExecuteScript", {
        "script": """
            var closed = [];
            var modais = document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button, [role="alertdialog"] button');
            modais.forEach(function(btn) {
                var txt = (btn.innerText || '').trim().toLowerCase();
                var label = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (['ok','fechar','close','entendi','got it','dismiss'].indexOf(txt) >= 0
                    || label.includes('fechar') || label.includes('close')) {
                    btn.click();
                    closed.push(txt || label);
                }
            });
            return closed.length > 0 ? 'Fechou: ' + closed.join(', ') : 'Sem popup';
        """,
        "args": []
    }, msg_id=msg_id)
    return resp


def save_screenshot(sock, filename, msg_id):
    shot_resp = send_command(sock, "WebDriver:TakeScreenshot", {"full": True, "hash": False}, msg_id=msg_id)
    match = re.search(r'"value":"([A-Za-z0-9+/=]+)"', shot_resp)
    if match:
        img_data = base64.b64decode(match.group(1))
        with open(filename, "wb") as f:
            f.write(img_data)
        print(f"Screenshot salvo em {filename}!")
    else:
        print(f"Screenshot falhou ({filename}):", shot_resp[:200])


def extrair_gasto(sock, msg_id, debug_label="last"):
    resp = send_command(sock, "WebDriver:ExecuteScript", {
        "script": "return document.body.innerText.substring(0, 20000);",
        "args": []
    }, msg_id=msg_id)
    idx = resp.find('"value":"')
    if idx < 0:
        return "0"
    texto = resp[idx+9:]
    texto = texto.rsplit('"', 1)[0].replace('\\n', '\n').replace('\\t', '\t')
    m = re.search(r'([$€]\s*[\d\.]+,\d+)\s*\nTotal usado', texto)
    if not m:
        m = re.search(r'Total usado\s*\n([$€]\s*[\d\.]+,\d+)', texto)
    if m:
        return m.group(1).strip()
    # Colunas: Desempenho — ordem: $ORÇAMENTO\nDiário\n$GASTO
    valores = re.findall(r'[$€]\s*[\d\.]+,\d+\nDiário\n([$€]\s*[\d\.]+,\d+)', texto)
    if valores:
        total = sum(parse_valor(v) for v in valores)
        return f"${total:.2f}"
    # Colunas: Vendas — ordem: $GASTO\n$ORÇAMENTO\nDiário
    valores = re.findall(r'([$€]\s*[\d\.]+,\d+)\n[$€]\s*[\d\.]+,\d+\nDiário', texto)
    if valores:
        total = sum(parse_valor(v) for v in valores)
        return f"${total:.2f}"
    # Salva debug quando não encontra
    safe = re.sub(r'[^A-Za-z0-9_-]', '_', debug_label)
    with open(f"debug_{safe}.txt", "w", encoding="utf-8", errors="ignore") as f:
        f.write(texto)
    print(f"  ⚠ NAO_ENCONTROU — debug salvo em debug_{safe}.txt")
    return "NAO_ENCONTROU"


def parse_valor(raw_str):
    if not raw_str or raw_str in ("NAO_ENCONTROU", "0"):
        return 0.0
    m = re.search(r'[\d\.]+,\d+', raw_str.replace(' ', ''))
    if m:
        return float(m.group().replace('.', '').replace(',', '.'))
    return 0.0


def descobrir_contas_bm(sock, bm_id, bm_nome, msg_id):
    """Navega no Ads Manager do BM e extrai todos os IDs de contas via links."""
    url = f"https://adsmanager.facebook.com/adsmanager/manage/campaigns?business_id={bm_id}&global_scope_id={bm_id}"
    send_command(sock, "WebDriver:Navigate", {"url": url}, msg_id=msg_id)
    msg_id += 1
    for _ in range(15):
        time.sleep(2)
        check = send_command(sock, "WebDriver:ExecuteScript", {
            "script": "return document.body.innerText.substring(0, 3000);",
            "args": []
        }, msg_id=msg_id)
        msg_id += 1
        if '"value":"' in check and len(check) > 400:
            break
    resp = send_command(sock, "WebDriver:ExecuteScript", {
        "script": """
            var ids = [];
            document.querySelectorAll('a[href]').forEach(function(a) {
                var m = a.href.match(/[?&]act=(\\d+)/);
                if (m && ids.indexOf(m[1]) === -1) ids.push(m[1]);
            });
            return ids.join(',');
        """,
        "args": []
    }, msg_id=msg_id)
    msg_id += 1
    idx = resp.find('"value":"')
    if idx < 0:
        return None, msg_id
    raw = resp[idx+9:].rsplit('"', 1)[0]
    ids = [x.strip() for x in raw.split(',') if x.strip() and x.strip().isdigit()]
    return (ids if ids else None), msg_id


# --- Abre o perfil AdsPower ---

requests.get(f"{ADSPOWER_API}/api/v1/browser/stop?user_id={PROFILE_ID}")
time.sleep(3)

resp = requests.get(f"{ADSPOWER_API}/api/v1/browser/start?user_id={PROFILE_ID}")
data = resp.json()
print("Resposta AdsPower:", data)

if data.get("code") != 0:
    raise RuntimeError(f"Falha ao abrir perfil: {data}")

marionette_port = int(data["data"]["marionette_port"])
print(f"Conectando via Marionette na porta {marionette_port}...")
time.sleep(3)

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("127.0.0.1", marionette_port))

initial = sock.recv(4096).decode("utf-8")
print("Marionette inicial:", initial)

session_resp = send_command(sock, "WebDriver:NewSession", {
    "capabilities": {"alwaysMatch": {"acceptInsecureCerts": True}}
}, msg_id=1)
print("Sessão criada:", session_resp[:200])

# --- Descobre todas as contas de cada BM ---

msg_id = 2
print("\nDescobindo contas em todos os BMs...")
BMS_ATIVO = []
for bm_info in BMS:
    ids_encontrados, msg_id = descobrir_contas_bm(sock, bm_info["bm_id"], bm_info["bm"], msg_id)
    hardcoded_por_id = {c["id"]: c["nome"] for c in bm_info["contas"]}
    if ids_encontrados:
        novos = [x for x in ids_encontrados if x not in hardcoded_por_id]
        if novos:
            print(f"  {bm_info['bm']}: +{len(novos)} contas novas → {novos}")
        todos_ids = list(hardcoded_por_id.keys()) + novos
        contas = [{"nome": hardcoded_por_id.get(cid, cid), "id": cid} for cid in todos_ids]
    else:
        print(f"  {bm_info['bm']}: usando lista fixa ({len(bm_info['contas'])} contas)")
        contas = bm_info["contas"]
    BMS_ATIVO.append({"bm": bm_info["bm"], "bm_id": bm_info["bm_id"], "contas": contas})

total_contas = sum(len(b["contas"]) for b in BMS_ATIVO)
print(f"Total: {len(BMS_ATIVO)} BMs, {total_contas} contas\n")

# --- Coleta gastos por conta ---

gastos_detalhados = []
total_usd = 0.0

for bm_info in BMS_ATIVO:
    bm_nome = bm_info["bm"]
    for conta in bm_info["contas"]:
        conta_nome = conta["nome"]
        conta_id = conta["id"]

        url = f"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={conta_id}&business_id={bm_info['bm_id']}&global_scope_id={bm_info['bm_id']}&date={date_param}&insights_date={date_param}"
        send_command(sock, "WebDriver:Navigate", {"url": url}, msg_id=msg_id)
        msg_id += 1

        print(f"\n[{bm_nome} | {conta_nome}] Aguardando carregar...")

        # Aguarda a tabela carregar (até 30s), verificando a cada 2s
        for _ in range(15):
            time.sleep(2)
            check = send_command(sock, "WebDriver:ExecuteScript", {
                "script": "return document.body.innerText.substring(0, 5000);",
                "args": []
            }, msg_id=msg_id)
            msg_id += 1
            if '$' in check and 'Carregando' not in check:
                break

        fechar_popups(sock, msg_id)
        msg_id += 1
        fechar_popups(sock, msg_id)
        msg_id += 1
        fechar_popups(sock, msg_id)
        msg_id += 1

        raw = extrair_gasto(sock, msg_id, debug_label=f"{bm_nome}_{conta_nome}")
        msg_id += 1

        gasto = parse_valor(raw)
        total_usd += gasto
        conta['gasto'] = gasto
        gastos_detalhados.append({"bm": bm_nome, "conta": conta_nome, "id": conta_id, "gasto": gasto})
        print(f"{bm_nome} | {conta_nome} | ${gasto:.2f}  (raw: {raw[:100]})")
        print(f"  → Total acumulado: ${total_usd:.2f}")

sock.close()

# --- Resumo por BM ---
print("\n=== RESUMO POR BM ===")
for bm_info in BMS_ATIVO:
    bm_nome = bm_info["bm"]
    subtotal = sum(g["gasto"] for g in gastos_detalhados if g["bm"] == bm_nome)
    print(f"  {bm_nome}: ${subtotal:.2f}")

print(f"\nTotal USD: ${total_usd:.2f}")

# --- Taxa de câmbio (para exibir BRL no resumo) ---
try:
    rate_resp = requests.get("https://hotmart-dashboard-woad.vercel.app/api/exchange-rate", timeout=10).json()
    rate = rate_resp.get("rate", 5.85)
except Exception as e:
    print(f"Erro ao buscar taxa: {e} — usando 5.85")
    rate = 5.85

total_brl = total_usd * rate
print(f"Taxa: R$ {rate:.2f} | Total BRL: R$ {total_brl:.2f}")


def gerar_resumo_whatsapp(bms, total_usd, rate, data_str):
    total_brl = total_usd * rate
    data_fmt = datetime.strptime(data_str, '%Y-%m-%d').strftime('%m/%Y')
    linhas = []
    linhas.append(f"📊 *Tráfego Pedro — {data_fmt}*")
    linhas.append(f"💰 *Total: ${total_usd:,.2f} × {rate:.2f} = R$ {total_brl:,.2f}*")
    linhas.append("")
    for bm in bms:
        gastos_bm = {c['nome']: c.get('gasto', 0) for c in bm['contas']}
        total_bm = sum(gastos_bm.values())
        if total_bm == 0:
            continue
        linhas.append(f"*{bm['bm']}* (${total_bm:,.2f})")
        for nome, gasto in gastos_bm.items():
            if gasto > 0:
                linhas.append(f"  {nome}: ${gasto:,.2f}")
        linhas.append("")
    return '\n'.join(linhas)


resumo = gerar_resumo_whatsapp(BMS_ATIVO, total_usd, rate, data_inicio_str)
print("\n" + "="*50)
print("RESUMO WHATSAPP (copiado para clipboard):")
print("="*50)
print(resumo)

try:
    subprocess.run(['clip'], input=resumo.encode('utf-8'), check=True)
    print("\n✅ Copiado para o clipboard!")
except Exception:
    print("\n⚠️ Não foi possível copiar para o clipboard")

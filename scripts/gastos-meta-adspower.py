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
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXl6amxxbGlvdHduemZsbGJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4MTQ1MSwiZXhwIjoyMDk0MjU3NDUxfQ.dWkAVbyUm7I-PO4M_WBPENidrA4ewjrwHm-PM5LArZ8"

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
        {"nome": "HT163879", "id": "1813005352990662"},
        {"nome": "HT680642", "id": "1279074321023402"},
        {"nome": "HT933265", "id": "1520046876226019"},
    ]},
]

ontem = (date.today() - timedelta(days=1))
ontem_str = ontem.strftime('%Y-%m-%d')
hoje_str = date.today().strftime('%Y-%m-%d')
date_param = f"{ontem_str}_{hoje_str}%2Cyesterday"
print(f"Coletando gastos de: {ontem_str}")

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


def extrair_gasto(sock, msg_id):
    resp = send_command(sock, "WebDriver:ExecuteScript", {
        "script": "return document.body.innerText.substring(0, 8000);",
        "args": []
    }, msg_id=msg_id)
    idx = resp.find('"value":"')
    if idx < 0:
        return "0"
    texto = resp[idx+9:]
    texto = texto.rsplit('"', 1)[0].replace('\\n', '\n').replace('\\t', '\t')
    with open("debug_last.txt", "w", encoding="utf-8", errors="ignore") as f:
        f.write(texto)
    m = re.search(r'(\$\s*[\d\.]+,\d+)\s*\nTotal usado', texto)
    if not m:
        m = re.search(r'Total usado\s*\n(\$\s*[\d\.]+,\d+)', texto)
    if m:
        return m.group(1).strip()
    valores = re.findall(r'\$\s*[\d\.]+,\d+\nDiário\n(\$\s*[\d\.]+,\d+)', texto)
    if valores:
        total = sum(parse_valor(v) for v in valores)
        return f"${total:.2f}"
    return "NAO_ENCONTROU"



def parse_valor(raw_str):
    match = re.search(r'\$\s*([\d]+[,\.][\d]+(?:[,\.][\d]+)?)', raw_str)
    if match:
        valor_str = match.group(1).replace(',', '.')
        partes = valor_str.split('.')
        if len(partes) > 2:
            valor_str = ''.join(partes[:-1]) + '.' + partes[-1]
        return float(valor_str)
    return 0.0


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

# --- Coleta gastos por conta ---

msg_id = 2
gastos_detalhados = []
total_usd = 0.0

for bm_info in BMS:
    bm_nome = bm_info["bm"]
    for conta in bm_info["contas"]:
        conta_nome = conta["nome"]
        conta_id = conta["id"]

        url = f"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={conta_id}&business_id={bm_info['bm_id']}&global_scope_id={bm_info['bm_id']}&date={date_param}&insights_date={date_param}"
        send_command(sock, "WebDriver:Navigate", {"url": url}, msg_id=msg_id)
        msg_id += 1

        print(f"\n[{bm_nome} | {conta_nome}] Aguardando carregar...")

        fechar_popups(sock, msg_id)
        msg_id += 1
        fechar_popups(sock, msg_id)
        msg_id += 1
        fechar_popups(sock, msg_id)
        msg_id += 1

        time.sleep(12)

        raw = extrair_gasto(sock, msg_id)
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
for bm_info in BMS:
    bm_nome = bm_info["bm"]
    subtotal = sum(g["gasto"] for g in gastos_detalhados if g["bm"] == bm_nome)
    print(f"  {bm_nome}: ${subtotal:.2f}")

print(f"\nTotal USD: ${total_usd:.2f}")

print("\nDeseja inserir esses gastos no dashboard? (s/n): ", end="")
confirmacao = input().strip().lower()
if confirmacao != 's':
    print("Inserção cancelada.")
    sock.close()
    exit(0)

# --- Taxa de câmbio ---
try:
    rate_resp = requests.get("https://hotmart-dashboard-woad.vercel.app/api/exchange-rate", timeout=10).json()
    rate = rate_resp.get("rate", 5.85)
except Exception as e:
    print(f"Erro ao buscar taxa: {e} — usando 5.85")
    rate = 5.85

total_brl = total_usd * rate
print(f"Taxa: R$ {rate:.2f}")
print(f"Total BRL: R$ {total_brl:.2f}")

# --- Supabase: busca projeto ---
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

projeto_id = "1e173ac3-0754-4967-8294-81afefb7a045"
projeto_nome = "Tráfego Pedro Inglês"

# --- Monta descrição detalhada ---
linhas = [f"Gastos Meta Ads - {ontem}"]
for bm_info in BMS:
    bm_nome = bm_info["bm"]
    contas_bm = [g for g in gastos_detalhados if g["bm"] == bm_nome]
    subtotal = sum(g["gasto"] for g in contas_bm)
    linhas.append(f"\n{bm_nome} (${subtotal:.2f}):")
    for g in contas_bm:
        if g["gasto"] > 0:
            linhas.append(f"  {g['conta']}: ${g['gasto']:.2f}")
linhas.append(f"\nTotal: ${total_usd:.2f} × {rate:.2f} = R${total_brl:.2f}")
descricao = "\n".join(linhas)

# --- INSERT no Supabase ---
payload = {
    "data": ontem_str,
    "valor": round(total_usd, 2),
    "moeda": "USD",
    "descricao": descricao,
}
if projeto_id:
    payload["projeto_id"] = projeto_id

insert_resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/custos_manuais",
    headers={**headers, "Prefer": "return=representation"},
    json=payload,
    timeout=10,
)

if insert_resp.status_code in (200, 201):
    print(f"\nInserido no projeto: {projeto_nome}")
    print(insert_resp.json())
else:
    print(f"\nErro ao inserir no Supabase: {insert_resp.status_code}")
    print(insert_resp.text[:500])

print(f"\n=== FINAL ===")
print(f"Total USD: ${total_usd:.2f}")
print(f"Taxa: R$ {rate:.2f}")
print(f"Total BRL: R$ {total_brl:.2f}")
print(f"Inserido no projeto: {projeto_nome}")


def gerar_resumo_whatsapp(bms, total_usd, rate, ontem_str):
    total_brl = total_usd * rate
    data_fmt = datetime.strptime(ontem_str, '%Y-%m-%d').strftime('%d/%m/%Y')
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


resumo = gerar_resumo_whatsapp(BMS, total_usd, rate, ontem_str)
print("\n" + "="*50)
print("RESUMO WHATSAPP (copiado para clipboard):")
print("="*50)
print(resumo)

try:
    subprocess.run(['clip'], input=resumo.encode('utf-8'), check=True)
    print("\n✅ Copiado para o clipboard!")
except Exception:
    print("\n⚠️ Não foi possível copiar para o clipboard")

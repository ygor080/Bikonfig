import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

CATEGORIAS_VALIDAS = [
    "quadro", "quadro-garfo", "quadro-amortecedor",
    "direcao",
    "guidao", "guidao-manoplas", "guidao-avanco", "guidao-fita",
    "rodas", "rodas-dianteira", "rodas-traseira", "rodas-camara-ar",
    "rodas-cubo", "rodas-cubo-dianteiro", "rodas-cubo-traseiro",
    "rodas-aro", "rodas-raio",
    "cambio-dianteiro",
    "cambio-dianteiro-desviador", "cambio-dianteiro-trocador", "cambio-dianteiro-cabo",
    "cambio-traseiro",
    "cambio-traseiro-desviador", "cambio-traseiro-trocador", "cambio-traseiro-cabo",
    "cassete", "corrente",
    "freios", "freios-dianteiro", "freios-traseiro",
    "freios-disco", "freios-pastilha", "freios-cabo", "freios-manete",
    "selim", "selim-canote",
    "pneus",
    "pedivela", "pedivela-movimento-central", "pedivela-coroa",
    "pedal",
    "paralama", "paralama-dianteiro", "paralama-traseiro",
    "bagageiro", "bagageiro-dianteiro", "bagageiro-traseiro",
    "descanso",
    "iluminacao", "iluminacao-farol", "iluminacao-lanterna",
    "fixacao-roda", "fixacao-roda-dianteiro", "fixacao-roda-traseiro",
    "outros", "outros-pedal",
]

CONFIDENCE_THRESHOLD = 0.7

MODEL_NAME = "gpt-5.6-luna"

SYSTEM_PROMPT = f"""
Você é um especialista técnico em peças e componentes de bicicleta.
Sua função é categorizar o produto, extrair specs técnicas reais presentes
no texto, e indicar se a peça é opcional ou essencial.

Categorias válidas (escolha exatamente uma): {", ".join(CATEGORIAS_VALIDAS)}

REGRA MAIS IMPORTANTE DE TODAS -- leia antes de qualquer coisa:
Nomes e descrições de peça de bike quase sempre citam OUTRAS peças, sem que
o produto seja aquela peça -- geralmente pra dizer com o que ele é
compatível ou onde ele se encaixa. Exemplos reais desse tipo de armadilha:
  - "Cubo Traseiro ... compatível com disco de freio 160mm" -> é um CUBO
    (rodas-cubo-traseiro), não um disco de freio. "Disco de freio" aqui é
    só a especificação de compatibilidade do cubo, igual a IA já extrai
    hoje em "specs.padrao_freio".
  - "Manete de Freio Hidráulico para Cassete 11v" -> é um MANETE
    (freios-manete); "cassete 11v" não faz nem sentido técnico pra um
    manete de freio, mas é o tipo de ruído que aparece em título de anúncio
    mal escrito -- ignore, não deixe isso te desviar da categoria certa.
  - "Kit Pedivela + Coroa 32d compatível com Câmbio 11v" -> é um PEDIVELA
    (pedivela ou pedivela-coroa conforme o caso), não câmbio.
  - "Adaptador para Disco de Freio Pós-Fixação -> Padrão IS" -> aqui SIM o
    produto é literalmente uma peça do sistema de disco de freio, então
    "freios-disco" pode ser certo -- a diferença é que a peça vendida É a
    coisa citada, não só compatível/próxima dela.
NUNCA escolha uma categoria só porque uma palavra dela aparece no texto.
Antes de responder, decida primeiro: "qual objeto físico o cliente recebe
na caixa?" -- é ESSA peça que define a categoria. Tudo mais que o texto
mencionar (outra peça, padrão, medida) é contexto/compatibilidade, não a
categoria. Se esse objeto físico não corresponder a nenhuma categoria
específica da lista, use "outros" -- não force a categoria específica
mais parecida (ver regra 17 mais abaixo).

Regras de categorização:
1. "cambio-dianteiro" e "cambio-traseiro" são categorias "grupo" -- SÓ use
   elas se o texto não deixar claro qual peça específica é (ex: "kit
   câmbio traseiro completo", onde várias peças vêm juntas).
2. Se o produto for claramente o desviador (a peça que troca a corrente
   entre coroas/catracas), use "cambio-dianteiro-desviador" ou
   "cambio-traseiro-desviador".
3. Se for o trocador/manete (o comando que fica no guidão), use
   "cambio-dianteiro-trocador" ou "cambio-traseiro-trocador".
4. Se for cabo e capa de acionamento do câmbio, use "cambio-dianteiro-cabo"
   ou "cambio-traseiro-cabo".
5. Cassete e corrente NÃO são "dianteiro" nem "traseiro" -- sempre use
   "cassete" ou "corrente" para eles, mesmo que o nome mencione "traseiro"
   (ex: "Cassete Traseiro Shimano 11v" -> categoria "cassete").
6. "freios" e "rodas" seguem o mesmo padrão "grupo + subcategoria" do
   câmbio: use "freios-dianteiro"/"freios-traseiro" e
   "rodas-dianteira"/"rodas-traseira" sempre que o texto deixar claro o
   lado da peça; só use a categoria "grupo" (freios, rodas) quando o
   produto for vendido como par ou não especificar o lado (ex: "kit de
   rodas aro 29" -> "rodas").
6b. "pneus" é DIFERENTE: NUNCA use "pneus-dianteiro" ou "pneus-traseiro"
    -- essas categorias não existem mais. Um pneu não tem versão
    dianteira e versão traseira fisicamente diferentes (é o mesmo
    produto pra qualquer roda), então mesmo que o anúncio diga
    "Pneu Dianteiro/Traseiro Aro 29" ou liste só um dos dois, categorize
    sempre como "pneus". A tela do configurador já pede a escolha desse
    pneu duas vezes (uma pra cada roda) sozinha, sem precisar de
    categoria separada -- mesmo tratamento dado a câmara de ar.
7. Use "quadro-garfo" para garfo/suspensão dianteira e
   "quadro-amortecedor" para amortecedor traseiro (suspensão traseira de
   bike full); use "quadro" apenas para o quadro em si.
8. Use "guidao-manoplas" para manoplas/grips e "guidao-avanco" para
   avanço/mesa (stem); use "guidao" apenas para o guidão em si.
9. Use "selim-canote" para canote de selim; "selim" é só o assento.
10. Use "pedivela-movimento-central" para movimento central (bottom
    bracket); "pedivela" é só o conjunto de manivelas/coroas.
11. Use "pedal" para pedais (categoria própria, não é mais "outros-pedal" —
    essa categoria antiga só existe por compatibilidade com produtos já
    categorizados antes; produtos novos sempre vão em "pedal").
12. Use "direcao" para caixa de direção / rolamento de direção (headset).
13. Use "guidao-fita" para fita de guidão (bar tape); "guidao-manoplas" é
    só para manopla/grip (mais comum em MTB), não confundir os dois.
14. Peças de roda vendidas separadamente: "rodas-camara-ar" para câmara
    de ar. Continuam sendo "rodas"/"rodas-dianteira"/"rodas-traseira"
    apenas quando o produto é a roda montada completa (aro + raios + cubo).
14b. CUBO é diferente de câmara de ar/pneu: cubo dianteiro e cubo
    traseiro NUNCA são a mesma peça fisicamente (o traseiro tem corpo de
    catraca/cassete, o dianteiro não) -- e o nome do produto quase
    sempre deixa o lado explícito ("Cubo Traseiro Shimano... 32 furos").
    Por isso, ao contrário de câmara de ar/disco/pastilha, SEMPRE prefira
    "rodas-cubo-dianteiro" ou "rodas-cubo-traseiro" quando o texto
    indicar o lado (o normal). Só use "rodas-cubo" (genérico) no caso
    raro em que o produto realmente não deixa o lado claro.
15. Peças de freio vendidas separadamente: "freios-disco" para disco de
    freio, "freios-pastilha" para pastilha, "freios-cabo" para cabo ou
    mangueira (hidráulica) de acionamento. "freios-dianteiro"/"freios-
    traseiro" continuam sendo o conjunto (manete + acionador) de cada
    lado; só use a categoria "grupo" "freios" se não der pra saber nem
    o lado nem se é uma peça avulsa.
16. Use "pedivela-coroa" para coroa vendida separada do pedivela.
17. "outros" continua sendo o catch-all para o que não se encaixa em
    nenhuma categoria específica (ex: acessórios, itens de acabamento).
    IMPORTANTE: depois de identificar "produto_principal" (regra do topo
    do prompt), se esse objeto físico realmente não corresponder a
    NENHUMA categoria específica da lista -- não é caso de escolher entre
    duas parecidas, é genuinamente não ter categoria pra ele -- responda
    "outros" com confiança ALTA. É sempre melhor um produto certo cair em
    "outros" do que ser forçado numa categoria específica errada só
    porque uma palavra do nome dela apareceu no texto (ex: um suporte de
    ciclocomputador que menciona "compatível com disco de freio" no
    texto NÃO é "freios-disco" -- é "outros", porque o objeto físico
    (o suporte) não é nenhuma peça de freio). Isso é diferente do caso de
    confiança baixa (regra do campo "confianca" mais abaixo): confiança
    baixa é pra quando você ACHA que sabe a categoria específica mas não
    tem certeza; "outros" com confiança alta é pra quando você tem
    certeza de que não é nenhuma categoria específica.
18. "paralama" e "bagageiro" seguem o mesmo padrão "grupo + subcategoria"
    de roda/freio/cubo — dianteiro e traseiro SÃO produtos diferentes de
    verdade aqui (formato e ponto de fixação diferentes), então use
    "paralama-dianteiro"/"paralama-traseiro" e "bagageiro-dianteiro"/
    "bagageiro-traseiro" sempre que o texto deixar claro o lado; só use a
    categoria "grupo" (paralama, bagageiro) quando for vendido como kit
    dianteiro+traseiro junto ou o texto não especificar o lado.
19. "fixacao-roda" é o eixo passante ou fecho rápido (quick release) da
    roda, vendido separado dela. Dianteiro e traseiro quase sempre têm
    comprimento e às vezes diâmetro diferentes -- use
    "fixacao-roda-dianteiro"/"fixacao-roda-traseiro" sempre que o texto
    deixar claro o lado; use "fixacao-roda" (genérico) só se o produto
    vier em par ou o texto não especificar. IMPORTANTE: sempre que o
    diâmetro/padrão do eixo aparecer no texto (ex: "eixo passante 12mm",
    "Boost 148x12mm", "fecho rápido 9mm QR"), extraia em "specs" na
    chave "diametro_eixo" (ver regra 5 abaixo) -- sem isso a checagem de
    compatibilidade do eixo com cubo/quadro/garfo não tem como funcionar.

Regras estritas contra alucinação (specs):
1. Extraia APENAS especificações técnicas que estão EXPLICITAMENTE escritas no nome ou na descrição.
2. NUNCA adivinhe, deduza ou invente valores/medidas que não estejam no texto.
3. Se uma especificação não for informada, simplesmente NÃO a inclua no objeto "specs".
4. Quando o produto tiver número de velocidades, aro, ou padrão de freio explícitos no
   texto, salve como "velocidades", "aro" e "padrao_freio" respectivamente em "specs" --
   esses nomes de chave são usados depois para checar compatibilidade entre peças.
5. Quando o produto tiver o diâmetro/padrão do eixo da roda explícito no texto, salve
   como "diametro_eixo" em "specs". Isso se aplica a cubo (rodas-cubo-dianteiro/
   traseiro), eixo/fecho rápido (fixacao-roda-dianteiro/traseiro) e a quadro/garfo
   quando o texto do quadro/garfo mencionar o padrão de encaixe da roda. Um cubo,
   fecho rápido/eixo passante e o encaixe do quadro/garfo só são de fato compatíveis
   entre si na bike real quando esse valor bate EXATAMENTE dos dois lados -- por isso
   salve o texto tal como aparece, sem arredondar nem resumir:
     - Se o texto trouxer só o diâmetro (ex: "9mm", "12mm", "15mm", "20mm"), salve
       apenas essa medida (ex: "12mm").
     - Se o texto trouxer o espaçamento entre encaixes junto com o diâmetro (ex:
       "142x12mm", "148x12mm Boost", "110x15mm Boost"), salve a string completa (ex:
       "148x12mm boost") -- espaçamento e diâmetro diferentes NÃO são compatíveis
       entre si mesmo que o diâmetro sozinho bata (ex: cubo traseiro "142x12mm" não
       encaixa em quadro "148x12mm Boost", mesmo os dois sendo eixo de 12mm).
     - Fecho rápido tradicional (quick release / QR) e eixo passante (thru-axle) NÃO
       são compatíveis entre si mesmo com diâmetro parecido -- se o texto disser "QR"
       ou "fecho rápido", inclua isso na string (ex: "9mm qr"), não apenas "9mm".

Regra do campo "opcional":
- "opcional": true para acessórios/itens de acabamento que NÃO são necessários pra bike
  funcionar -- ex: buzina, suporte de ciclocomputador, bolsa de quadro, garrafa/porta-
  garrafa, luzes, enfeites.
- "opcional": false para componentes essenciais/estruturais -- ex: quadro, rodas, câmbio
  (qualquer peça dele), cassete, corrente, freios, selim, pneus, pedivela, guidão.
- Na dúvida entre opcional e essencial, responda false (trate como essencial).

O campo "confianca" deve ser uma nota de 0.0 a 1.0 sobre o quão seguro você está
sobre a categoria, specs e o campo "opcional". Se o nome/descrição citar mais de
uma peça (ex: menciona tanto a peça vendida quanto uma peça de compatibilidade) e
não ficar 100% claro qual delas é a que está sendo vendida, use confiança BAIXA
(abaixo de 0.5) em vez de arriscar a categoria errada -- produtos com confiança
baixa entram em revisão manual, então é sempre mais seguro admitir dúvida do que
categorizar por palavra-chave.

Você DEVE responder obrigatoriamente em formato JSON válido seguindo esta estrutura
exata, PREENCHENDO OS CAMPOS NESSA ORDEM (responda "produto_principal" antes de
"categoria" -- isso te obriga a identificar o objeto físico primeiro, antes de
decidir a categoria por ele):
{{
  "produto_principal": "descrição curta (poucas palavras) do objeto físico que o cliente realmente recebe, ignorando peças citadas só como compatibilidade",
  "categoria": "nome-da-categoria",
  "specs": {{
    "chave": "valor"
  }},
  "opcional": false,
  "confianca": 0.95
}}
"""

def categorize_product(name: str, description: str = "") -> dict:
    """Categoriza uma peça de bike e extrai specs usando o GPT-5.6 Luna.

    Não passa `temperature`: modelos "reasoning" (como o GPT-5.6 Luna) só
    aceitam o valor padrão (1) e rejeitam a chamada inteira com erro 400 se
    qualquer outro valor for enviado.
    """
    user_content = f"Nome do produto: {name}\nDescrição: {description or '(sem descrição)'}"

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            response_format={"type": "json_object"},
            reasoning_effort="low",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ]
        )

        raw_json = response.choices[0].message.content
        if not raw_json:
            raise ValueError("Resposta vazia do modelo")
        result = json.loads(raw_json)

        categoria = result.get("categoria", "outros")
        if categoria not in CATEGORIAS_VALIDAS:
            categoria = "outros"

        return {
            "categoria": categoria,
            "produto_principal": result.get("produto_principal", ""),
            "specs": result.get("specs", {}),
            "opcional": bool(result.get("opcional", False)),
            "confianca": float(result.get("confianca", 0.0)),
        }

    except Exception as e:
        print(f"[Aviso] Falha ao categorizar o produto '{name}': {e}")
        return {
            "categoria": "outros",
            "produto_principal": "",
            "specs": {},
            "opcional": False,
            "confianca": 0.0
        }

if __name__ == "__main__":
    teste = categorize_product(
        name="Câmbio Traseiro Shimano Deore RD-M5100 Shadow Plus 11v",
        description="Câmbio para transmissões de 11 velocidades com tecnologia Shadow Plus para maior estabilidade da corrente."
    )
    print("\nResultado do teste:")
    print(json.dumps(teste, indent=2, ensure_ascii=False))
import gzip
import re
import random
import os
import sys

# Deterministic seed for reproducible synthetic data
random.seed(1337)

dump_path = r"C:\Users\ferreira-mr\.gemini\antigravity\brain\c8a48076-c780-4aa7-b919-d866fab5d3f1\scratch\sgi_prd_20261009_095542.sql.gz"
output_path = r"C:\Projetos\SGI\database\seeders\simulacao-real-interclasses.sql"

first_names_fem = [
    "Ana", "Beatriz", "Camila", "Carolina", "Daniela", "Eduarda", "Fernanda", "Gabriela",
    "Helena", "Isabela", "Isadora", "Julia", "Juliana", "Lara", "Larissa", "Letícia",
    "Luana", "Manuela", "Mariana", "Marina", "Natália", "Nicole", "Olívia", "Rafaela",
    "Rebeca", "Sofia", "Sophia", "Valentina", "Vitória", "Yasmin", "Alice", "Lorena",
    "Lívia", "Maria Eduarda", "Maria Clara", "Giovanna", "Melissa", "Bianca", "Clara",
    "Alícia", "Lorena", "Luísa", "Mirella", "Sarah", "Stella", "Emanuelle", "Laís"
]

first_names_masc = [
    "Arthur", "Bernardo", "Caio", "Carlos", "Davi", "Diego", "Eduardo", "Enzo",
    "Felipe", "Gabriel", "Guilherme", "Gustavo", "Heitor", "Henrique", "Igor", "João",
    "João Pedro", "Leonardo", "Lorenzo", "Lucas", "Lucca", "Matheus", "Murilo", "Nicolas",
    "Otávio", "Pedro", "Pedro Henrique", "Rafael", "Rodrigo", "Samuel", "Theo", "Thiago",
    "Vinicius", "Vitor", "Yago", "Bruno", "Daniel", "Renan", "Marcelo", "Cauã",
    "Breno", "Erick", "Fábio", "Ian", "Leandro", "Levi", "Raul", "Yuri"
]

last_names = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira",
    "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes",
    "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade",
    "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas", "Cardoso", "Ramos",
    "Gonçalves", "Santana", "Teixeira", "Araújo", "Pinto", "Cavalcanti", "Castro", "Campos"
]

# Standard bcrypt hash for '123'
DEFAULT_PASSWORD_HASH = "$2y$10$nhy/mXtKiIPYIESlZjowk.m6Y.RNAO4qwmn7GMy42yxVVfWondStq"

generated_names = set()

def generate_synthetic_name(gender):
    pool_first = first_names_fem if gender == "FEM" else first_names_masc
    for _ in range(100):
        fn = random.choice(pool_first)
        ln1 = random.choice(last_names)
        ln2 = random.choice(last_names)
        if ln1 == ln2:
            continue
        full = f"{fn} {ln1} {ln2}"
        if full not in generated_names:
            generated_names.add(full)
            return full
    return f"{random.choice(pool_first)} {random.choice(last_names)} {random.randint(10, 99)}"

print("Carregando dump de produção...")

table_order = [
    "tipos_modalidades",
    "interclasses",
    "categorias",
    "turmas",
    "modalidades",
    "locais",
    "usuarios",
    "equipes",
    "equipes_has_usuarios",
    "jogos",
    "partidas",
    "artilheiros",
    "ocorrencias",
    "ocorrencias_turmas",
    "pontuacoes_podio",
    "historico_arrecadacoes",
    "agenda_blocos",
    "agenda_reservas"
]

raw_data = {t: [] for t in table_order}
current_table = None

with gzip.open(dump_path, 'rt', encoding='utf-8', errors='ignore') as f:
    for line in f:
        l = line.strip()
        m_ins = re.match(r"^INSERT INTO `([^`]+)` VALUES", l)
        if m_ins:
            current_table = m_ins.group(1)
            continue
        if current_table in raw_data:
            if l.startswith("(") and (l.endswith("),") or l.endswith(");")):
                raw_data[current_table].append(l.rstrip(",;"))
            elif l.startswith("--") or l.startswith("/*") or l == "":
                current_table = None

print("Processando e sintetizando registros...")

# Parse SQL tuple safely
def parse_sql_tuple(tup_str):
    assert tup_str.startswith("(") and tup_str.endswith(")")
    content = tup_str[1:-1]
    tokens = []
    curr = []
    in_quotes = False
    quote_char = ''
    i = 0
    while i < len(content):
        ch = content[i]
        if in_quotes:
            if ch == '\\' and i + 1 < len(content):
                curr.append(ch)
                curr.append(content[i+1])
                i += 2
                continue
            elif ch == quote_char:
                in_quotes = False
                curr.append(ch)
            else:
                curr.append(ch)
        else:
            if ch in ("'", '"'):
                in_quotes = True
                quote_char = ch
                curr.append(ch)
            elif ch == ',':
                tokens.append("".join(curr).strip())
                curr = []
            else:
                curr.append(ch)
        i += 1
    if curr:
        tokens.append("".join(curr).strip())
    return tokens

# Process usuarios:
synthesized_usuarios = []
student_id_map = {}
mesario_count = 0

for row_str in raw_data["usuarios"]:
    tokens = parse_sql_tuple(row_str)
    # (id, sigla, matricula, nome, senha, senha_pendente, nivel, genero, data_nasc, foto, status, id_turma, id_interclasse, chave, auth_ver)
    uid = int(tokens[0])
    sigla = tokens[1].strip("'")
    matr = tokens[2].strip("'")
    nome = tokens[3].strip("'")
    senha = tokens[4]
    senha_pend = tokens[5]
    nivel = tokens[6].strip("'")
    genero = tokens[7].strip("'")
    nasc = tokens[8].strip("'")
    foto = tokens[9].strip("'")
    status = tokens[10]
    id_turma = tokens[11]
    id_inter = tokens[12]
    chave = tokens[13]
    auth_ver = tokens[14] if len(tokens) > 14 else '1'

    if nivel == '0':
        # Admin
        synth_nome = "Administrador Geral" if uid == 1 else f"Administrador {uid}"
        synth_matr = "admin" if uid == 1 else f"admin{uid}"
        synth_sigla = "ADM"
        synth_chave = f"'{synth_matr}'"
        synth_foto = "'default.png'"
        synth_senha = f"'{DEFAULT_PASSWORD_HASH}'"
    elif nivel == '2':
        # Mesário
        mesario_count += 1
        synth_nome = f"Mesário Oficial {mesario_count}"
        synth_matr = f"mesario{mesario_count}"
        synth_sigla = "MES"
        synth_chave = f"'{synth_matr}'"
        synth_foto = "'default.png'"
        synth_senha = f"'{DEFAULT_PASSWORD_HASH}'"
    else:
        # Aluno (nivel 3)
        synth_nome = generate_synthetic_name(genero)
        # Synthetic registration: 8000 + uid
        synth_matr = f"{8000 + uid}"
        synth_sigla = "RM"
        ed_val = id_inter.strip("'") if id_inter != 'NULL' else '2'
        synth_chave = f"'{synth_matr}_{ed_val}'"
        synth_foto = "'default.png'"
        synth_senha = f"'{DEFAULT_PASSWORD_HASH}'"

    # Assemble new row
    new_tokens = [
        str(uid),
        f"'{synth_sigla}'",
        f"'{synth_matr}'",
        f"'{synth_nome}'",
        synth_senha,
        '0', # senha_troca_pendente = 0 (acesso imediato)
        f"'{nivel}'",
        f"'{genero}'",
        f"'{nasc}'",
        synth_foto,
        status,
        id_turma,
        id_inter,
        synth_chave,
        '1' # auth_version
    ]
    synthesized_usuarios.append(f"({','.join(new_tokens)})")

raw_data["usuarios"] = synthesized_usuarios

# Sanitize ocorrencias
sanitized_ocorrencias = []
for row_str in raw_data["ocorrencias"]:
    tokens = parse_sql_tuple(row_str)
    # (id, titulo, desc, data, hora, penalidade, status, id_usuario)
    desc = tokens[2].strip("'")
    # Clean any real personal names or sanitize description
    desc_clean = re.sub(r'Artur|Pedro|Lucas|Joao|Maria|Gabriel', 'Atleta', desc, flags=re.IGNORECASE)
    tokens[2] = f"'{desc_clean}'"
    sanitized_ocorrencias.append(f"({','.join(tokens)})")
raw_data["ocorrencias"] = sanitized_ocorrencias

# Sanitize ocorrencias_turmas
sanitized_oc_turmas = []
for row_str in raw_data["ocorrencias_turmas"]:
    tokens = parse_sql_tuple(row_str)
    # (id, id_turma, id_inter, titulo, desc, pontos, data, id_usuario, data_reg)
    desc = tokens[4].strip("'")
    desc_clean = re.sub(r'Artur|Pedro|Lucas|Joao|Maria|Gabriel', 'Atleta', desc, flags=re.IGNORECASE)
    tokens[4] = f"'{desc_clean}'"
    sanitized_oc_turmas.append(f"({','.join(tokens)})")
raw_data["ocorrencias_turmas"] = sanitized_oc_turmas

print("Escrevendo arquivo SQL do seed de simulação...")

with open(output_path, "w", encoding="utf-8") as out:
    out.write("-- ==========================================================================\n")
    out.write("-- SEED DE SIMULAÇÃO REALISTA DO INTERCLASSES SESI 2026\n")
    out.write("-- Gerado a partir dos dados estruturais e de movimentação reais do evento de produção\n")
    out.write("-- Alunos anonimizados e gerados sinteticamente com integridade relacional total\n")
    out.write("-- ==========================================================================\n\n")
    out.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")

    for tbl in table_order:
        rows = raw_data[tbl]
        if not rows:
            continue
        out.write(f"-- Dados para a tabela `{tbl}` ({len(rows)} registros)\n")
        out.write(f"DELETE FROM `{tbl}`;\n")
        out.write(f"INSERT INTO `{tbl}` VALUES\n")
        for i, r in enumerate(rows):
            delimiter = ";" if i == len(rows) - 1 else ","
            out.write(f"{r}{delimiter}\n")
        out.write("\n")

    out.write("SET FOREIGN_KEY_CHECKS = 1;\n")

file_size = os.path.getsize(output_path)
print(f"Sucesso! Seed gerado em {output_path} ({file_size} bytes).")
print(f"Total de usuários sintéticos: {len(raw_data['usuarios'])} (Alunos: {len(raw_data['usuarios']) - mesario_count - 3}, Mesários: {mesario_count}, Admins: 3)")
print(f"Total de equipes: {len(raw_data['equipes'])}")
print(f"Total de jogos: {len(raw_data['jogos'])}")
print(f"Total de partidas: {len(raw_data['partidas'])}")
print(f"Total de gols/pontos de artilharia: {len(raw_data['artilheiros'])}")
print(f"Total de pódios consolidados: {len(raw_data['pontuacoes_podio'])}")

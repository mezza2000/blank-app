import io
import itertools
import zipfile
import xml.etree.ElementTree as et

import streamlit as st


NOMI_FILE_VALIDI = {"credenziali.docx", "credeziali.docx"}


def leggi_docx(file_bytes: bytes) -> str:
    """Legge il testo da un file .docx senza dipendenze esterne."""
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx_zip:
        xml_content = docx_zip.read("word/document.xml")

    root = et.fromstring(xml_content)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    parti = [nodo.text for nodo in root.findall(".//w:t", ns) if nodo.text]
    return " ".join(parti)


def estrai_target(testo: str) -> dict[str, str]:
    """Estrae caratteri unici richiesti: MAIUSCOLE, NUMERI e SPECIALI."""
    unici = []
    visti = set()

    for char in testo:
        if char not in visti:
            visti.add(char)
            unici.append(char)

    maiuscole = "".join(c for c in unici if c.isalpha() and c.isupper())
    numeri = "".join(c for c in unici if c.isdigit())
    speciali = "".join(c for c in unici if not c.isalpha() and not c.isdigit() and not c.isspace())
    risposta = maiuscole + numeri + speciali

    return {
        "risposta": risposta,
        "maiuscole": maiuscole,
        "numeri": numeri,
        "speciali": speciali,
    }


def genera_incastri(charset: str, lunghezza: int, max_risultati: int = 150) -> list[str]:
    incastri = []
    for combo in itertools.product(charset, repeat=lunghezza):
        incastri.append("".join(combo))
        if len(incastri) >= max_risultati:
            break
    return incastri


st.set_page_config(page_title="Credenziale - da file Word", page_icon="🤖")
st.title("🔐 Gioco Credenziale (carica file Word)")
st.write(
    "Carica il file Word chiamato **credenziali.docx** (o credeziali.docx): "
    "il bot parte subito per trovare la parola/password nascosta."
)

with st.popover("🔑 Password"):
    st.markdown(
        "1. Carica `credenziali.docx`\n"
        "2. Parte il gioco automaticamente\n"
        "3. Prova gli incastri possibili"
    )

file_docx = st.file_uploader("Carica file Word (.docx)", type=["docx"])
lunghezza_incastro = st.slider("Lunghezza incastro/password", min_value=2, max_value=5, value=3)

if file_docx is None:
    st.info("Aspetto il file Word per avviare il gioco automaticamente.")
else:
    try:
        nome_file = file_docx.name.lower()
        if nome_file not in NOMI_FILE_VALIDI:
            st.error("Il file deve chiamarsi `credenziali.docx` (accettato anche `credeziali.docx`).")
            st.stop()

        testo = leggi_docx(file_docx.getvalue())
        if not testo.strip():
            st.warning("Il file sembra vuoto o senza testo leggibile.")
        else:
            risultato = estrai_target(testo)
            st.toast("Password: gioco avviato!", icon="🔑")
            st.success("Password trovata!")
            st.subheader("Password finale (MAIUSCOLE + NUMERI + SPECIALI)")
            st.code(risultato["risposta"] or "(nessun carattere trovato)")

            col1, col2, col3 = st.columns(3)
            with col1:
                st.markdown("**Maiuscole**")
                st.code(risultato["maiuscole"] or "(nessuna)")
            with col2:
                st.markdown("**Numeri**")
                st.code(risultato["numeri"] or "(nessuno)")
            with col3:
                st.markdown("**Speciali**")
                st.code(risultato["speciali"] or "(nessuno)")

            charset = risultato["risposta"]
            if charset:
                st.subheader("🧩 Incastri possibili")
                incastri = genera_incastri(charset, lunghezza_incastro)
                st.write(f"Primi {len(incastri)} incastri generati (lunghezza {lunghezza_incastro}):")
                st.code("\n".join(incastri))
            else:
                st.info("Nessun carattere utile per generare incastri.")

    except (KeyError, zipfile.BadZipFile, et.ParseError):
        st.error("File non valido. Carica un vero file Word in formato .docx.")

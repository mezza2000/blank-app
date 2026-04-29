import streamlit as st


def estrai_caratteri_unici(testo: str) -> dict[str, str]:
    """Estrae i caratteri unici dal testo, mantenendo il primo ordine di apparizione."""
    unici = []
    visti = set()

    for char in testo:
        if char not in visti:
            unici.append(char)
            visti.add(char)

    lettere_minuscole = "".join(c for c in unici if c.isalpha() and c.islower())
    lettere_maiuscole = "".join(c for c in unici if c.isalpha() and c.isupper())
    numeri = "".join(c for c in unici if c.isdigit())
    spazi = "".join(c for c in unici if c.isspace())
    speciali = "".join(
        c
        for c in unici
        if not c.isalpha() and not c.isdigit() and not c.isspace()
    )

    risposta = "".join(unici)

    return {
        "risposta": risposta,
        "minuscole": lettere_minuscole,
        "maiuscole": lettere_maiuscole,
        "numeri": numeri,
        "speciali": speciali,
        "spazi": spazi,
    }


st.set_page_config(page_title="Bot trova-caratteri", page_icon="🤖")
st.title("🤖 Bot per trovare la risposta del gioco")
st.write(
    "Incolla il testo del gioco e il bot estrae **tutti i caratteri unici** "
    "(minuscole, maiuscole, numeri, spazi e simboli), così puoi rispondere prima."
)

input_testo = st.text_area("Testo del gioco", height=220, placeholder="Incolla qui il testo...")

if st.button("Trova risposta"):
    if not input_testo.strip():
        st.warning("Inserisci prima un testo valido.")
    else:
        risultato = estrai_caratteri_unici(input_testo)

        st.success("Risposta trovata!")
        st.subheader("Risposta completa (ordine di apparizione)")
        st.code(risultato["risposta"])

        col1, col2 = st.columns(2)
        with col1:
            st.markdown("**Lettere minuscole**")
            st.code(risultato["minuscole"] or "(nessuna)")
            st.markdown("**Lettere maiuscole**")
            st.code(risultato["maiuscole"] or "(nessuna)")
            st.markdown("**Numeri**")
            st.code(risultato["numeri"] or "(nessuno)")

        with col2:
            st.markdown("**Caratteri speciali**")
            st.code(risultato["speciali"] or "(nessuno)")
            st.markdown("**Spazi / a capo / tab**")
            st.code(repr(risultato["spazi"]) if risultato["spazi"] else "(nessuno)")

        st.caption(
            f"Totale caratteri unici trovati: {len(risultato['risposta'])}"
        )

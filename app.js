// Python Karten: die Oberfläche.
// Die Regeln (Fortschritt, Auswahl, Quizfragen, Farben für Code) stehen in logik.js, die Karten in karten.js.
(function () {
  'use strict';

  const APP_STAND = '06.11.2026';
  const ANSICHTEN = ['laden', 'start', 'quiz', 'karten', 'ergebnis', 'nachschlagen', 'fehler'];
  // Name der "Datei" im Tab oben. Er zeigt, auf welcher Ansicht du gerade bist (wie im Editor).
  const TAB_NAMEN = {
    laden: 'laden.py',
    start: 'start.py',
    quiz: 'quiz.py',
    karten: 'karteikarten.py',
    ergebnis: 'ergebnis.py',
    nachschlagen: 'nachschlagen.py',
    fehler: 'fehler.py'
  };
  // Tasten fürs Quiz am Rechner: 1 bis 4 oder A bis D
  const TASTEN = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };

  const $ = (id) => document.getElementById(id);

  function zeige(ansicht) {
    ANSICHTEN.forEach((id) => {
      const abschnitt = $(id);
      if (abschnitt) abschnitt.hidden = id !== ansicht;
    });
    // Das Aussehen hängt an der Ansicht (zum Beispiel zeigt nur der Start die Titelzeilen), und der Tab nennt sie wie eine Datei.
    document.body.setAttribute('data-ansicht', ansicht);
    const tab = $('tab-name');
    if (tab) tab.textContent = TAB_NAMEN[ansicht] || 'python-karten.py';
    window.scrollTo(0, 0);
  }

  const PK = window.PK;
  const KARTEN = window.KARTEN;
  if (!PK || !Array.isArray(KARTEN) || KARTEN.length === 0) {
    zeige('fehler');
    $('neu-laden').addEventListener('click', () => window.location.reload());
    return;
  }

  // ---------- Speicher ----------

  function speicherHolen() {
    try {
      const s = window.localStorage;
      s.setItem('python-karten-probe', '1');
      s.removeItem('python-karten-probe');
      return s;
    } catch (fehler) {
      return null;
    }
  }

  const speicher = speicherHolen();
  // Mit ?test=1 in der Adresse nutzt die App einen eigenen Speicher. So spielt pruefen.html sie durch, ohne deinen Fortschritt
  // und dein Design anzufassen.
  const TESTMODUS = /[?&]test=1(&|$)/.test(window.location.search);
  const KEY = PK.SPEICHER_KEY + (TESTMODUS ? '-test' : '');
  let stand = PK.standLaden(speicher, KEY);

  function sichern() {
    PK.standSichern(speicher, stand, KEY);
    statusAktualisieren();
  }

  // ---------- Design: Auto (folgt dem Gerät), Hell oder Dunkel ----------

  const DESIGN_KEY = 'python-karten-design' + (TESTMODUS ? '-test' : '');
  const DESIGN_NAMEN = { auto: 'Auto', hell: 'Hell', dunkel: 'Dunkel' };
  // Farbe der Leiste, die das Gerät oben zeichnet (theme-color), wenn Hell oder Dunkel fest gewählt ist
  const DESIGN_FARBEN = { hell: '#f0f0f0', dunkel: '#2d2d2d' };
  let design = 'auto';
  try {
    const gewaehlt = speicher ? speicher.getItem(DESIGN_KEY) : null;
    if (gewaehlt === 'hell' || gewaehlt === 'dunkel') design = gewaehlt;
  } catch (fehler) {
    design = 'auto';
  }

  function geraetIstDunkel() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function designAnwenden() {
    const wurzel = document.documentElement;
    if (design === 'auto') wurzel.removeAttribute('data-design');
    else wurzel.setAttribute('data-design', design);
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      if (!meta.dataset.auto) meta.dataset.auto = meta.getAttribute('content') || '';
      meta.setAttribute('content', design === 'auto' ? meta.dataset.auto : DESIGN_FARBEN[design]);
    });
    const knopf = $('design-knopf');
    if (knopf) {
      knopf.textContent = 'Design : ' + DESIGN_NAMEN[design];
      knopf.setAttribute('aria-label', 'Design wechseln, jetzt ' + DESIGN_NAMEN[design]);
    }
  }

  // Der erste Tipp ändert immer sichtbar etwas: erst das Gegenteil vom Gerät, dann dasselbe wie das Gerät, dann wieder Auto.
  function designWechseln() {
    const gegenteil = geraetIstDunkel() ? 'hell' : 'dunkel';
    const gleich = geraetIstDunkel() ? 'dunkel' : 'hell';
    design = design === 'auto' ? gegenteil : design === gegenteil ? gleich : 'auto';
    try {
      if (speicher) {
        if (design === 'auto') speicher.removeItem(DESIGN_KEY);
        else speicher.setItem(DESIGN_KEY, design);
      }
    } catch (fehler) {
      // Speichern geht nicht: Die Wahl gilt dann nur, bis die Seite neu geladen wird.
    }
    designAnwenden();
  }

  // Statusleiste unten: wie die Zeile im Editor, hier mit dem Gesamtstand
  function statusAktualisieren() {
    const feld = $('status-karten');
    if (!feld) return;
    const z = PK.zaehlen(stand, KARTEN);
    feld.textContent = 'sicher : ' + z.sicher + ' / ' + z.gesamt;
  }

  // ---------- Kleine Helfer ----------

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text) e.textContent = text;
    return e;
  }

  function prozent(teil, ganz) {
    return ganz > 0 ? Math.round((teil / ganz) * 100) : 0;
  }

  function balkenSetzen(id, teil, ganz) {
    $(id).style.width = prozent(teil, ganz) + '%';
  }

  // Zeigt den Text, oder versteckt das Element, wenn nichts da ist.
  function textSetzen(knoten, text) {
    knoten.textContent = text || '';
    knoten.hidden = !text;
  }

  function ohneFarben(text) {
    return text.split('\n').map((zeile) => (zeile ? [{ t: 'txt', s: zeile }] : []));
  }

  // Zeigt Text Zeile für Zeile wie in einem Editor. Die Zeilennummern kommen aus dem Aussehen (style.css), nicht aus dem Text:
  // textContent ist danach genau der Text. art 'code' färbt Python (PK.zerlegen), art 'text' lässt den Text, wie er ist.
  function zeilenSetzen(knoten, text, art) {
    const inhalt = String(text === undefined || text === null ? '' : text);
    let zeilen;
    try {
      zeilen = art === 'code' ? PK.zerlegen(inhalt) : ohneFarben(inhalt);
    } catch (fehler) {
      // Die Farben sind nur Zierde: Geht etwas schief, kommt der Text ohne Farben.
      zeilen = ohneFarben(inhalt);
    }
    knoten.textContent = '';
    zeilen.forEach((stuecke, i) => {
      const zeile = el('span', 'zeile', '');
      stuecke.forEach((stueck) => {
        if (stueck.t === 'txt') zeile.appendChild(document.createTextNode(stueck.s));
        else zeile.appendChild(el('span', 'c-' + stueck.t, stueck.s));
      });
      knoten.appendChild(zeile);
      if (i < zeilen.length - 1) knoten.appendChild(document.createTextNode('\n'));
    });
  }

  // Beispielcode mit Zeilennummern und Farben, oder versteckt, wenn es keinen gibt.
  function beispielSetzen(knoten, text) {
    if (text) zeilenSetzen(knoten, text, 'code');
    else knoten.textContent = '';
    knoten.hidden = !text;
  }

  function themaName(thema) {
    return thema === PK.ALLE ? 'Alle Themen' : thema;
  }

  // ---------- Start ----------

  let quiz = null;
  let kartenLauf = null;
  let letzteArt = 'quiz';

  function themaWaehlen(name) {
    stand.thema = name;
    sichern();
    $('themen').querySelectorAll('button').forEach((knopf) => {
      knopf.setAttribute('aria-pressed', knopf.dataset.thema === name ? 'true' : 'false');
    });
  }

  function themenZeichnen() {
    const box = $('themen');
    box.textContent = '';
    const namen = [PK.ALLE].concat(PK.themen(KARTEN));
    // Ein gespeichertes Thema, das es nicht mehr gibt, fällt auf "Alle" zurück.
    if (namen.indexOf(stand.thema) === -1) stand.thema = PK.ALLE;
    namen.forEach((name) => {
      const z = PK.zaehlen(stand, PK.kartenVon(name, KARTEN));
      const knopf = el('button', 'thema', '');
      knopf.type = 'button';
      knopf.dataset.thema = name;
      knopf.setAttribute('aria-pressed', name === stand.thema ? 'true' : 'false');
      knopf.appendChild(el('span', 'thema-name', themaName(name)));
      knopf.appendChild(el('span', 'thema-zahl', z.sicher + ' von ' + z.gesamt + ' sicher'));
      const spur = el('span', 'mini-balken', '');
      const fuell = el('span', '', '');
      fuell.style.width = prozent(z.sicher, z.gesamt) + '%';
      spur.appendChild(fuell);
      knopf.appendChild(spur);
      knopf.addEventListener('click', () => themaWaehlen(name));
      box.appendChild(knopf);
    });
  }

  function startZeigen() {
    quiz = null;
    kartenLauf = null;
    const z = PK.zaehlen(stand, KARTEN);
    $('gesamt-sicher').textContent = String(z.sicher);
    $('gesamt-anzahl').textContent = String(z.gesamt);
    balkenSetzen('gesamt-balken', z.sicher, z.gesamt);
    themenZeichnen();
    $('stand-zeile').textContent =
      'Stand ' + APP_STAND + ' · ' + KARTEN.length + ' Karten' + (speicher ? '' : ' · Fortschritt wird hier nicht gespeichert');
    statusAktualisieren();
    zeige('start');
  }

  // Eine Runde: zehn Karten, bei denen Neues und Verfehltes öfter drankommt.
  function neueRunde() {
    const auswahl = PK.rundeZiehen(PK.kartenVon(stand.thema, KARTEN), stand, PK.RUNDE);
    return {
      thema: stand.thema,
      liste: auswahl.map((karte) => ({ karte: karte, wiederholung: false })),
      erste: auswahl.length,
      position: 0,
      richtig: 0,
      verfehlt: [],
      offen: true
    };
  }

  // ---------- Quiz ----------

  function quizStarten() {
    quiz = neueRunde();
    letzteArt = 'quiz';
    quizFrageZeigen();
    zeige('quiz');
  }

  function quizFrageZeigen() {
    const eintrag = quiz.liste[quiz.position];
    const karte = eintrag.karte;
    const richtung = PK.richtungWaehlen(PK.eintrag(stand, karte.id));
    const aufgabe = PK.aufgabeBauen(karte, richtung, KARTEN);
    eintrag.aufgabe = aufgabe;
    quiz.offen = true;
    $('quiz-fortschritt').textContent = 'Frage ' + (quiz.position + 1) + ' von ' + quiz.liste.length;
    balkenSetzen('quiz-balken', quiz.position, quiz.liste.length);
    $('quiz-thema').textContent = karte.kat + (eintrag.wiederholung ? ' · Wiederholung' : '');
    $('quiz-frage').textContent = aufgabe.frage;
    const anzeige = $('quiz-anzeige');
    anzeige.className = 'anzeige ' + (aufgabe.anzeigeCode ? 'code' : 'text');
    zeilenSetzen(anzeige, aufgabe.anzeige, aufgabe.anzeigeCode ? 'code' : 'text');
    const box = $('quiz-antworten');
    box.textContent = '';
    aufgabe.optionen.forEach((option, i) => {
      const knopf = el('button', 'antwort' + (aufgabe.antwortCode ? ' code' : ''), '');
      knopf.type = 'button';
      const buchstabe = el('span', 'buchstabe', 'ABCD'.charAt(i));
      buchstabe.setAttribute('aria-hidden', 'true');
      knopf.appendChild(buchstabe);
      knopf.appendChild(el('span', 'antwort-text', option.text));
      knopf.addEventListener('click', () => quizAntwort(i));
      box.appendChild(knopf);
    });
    $('quiz-rueckmeldung').hidden = true;
  }

  function quizAntwort(index) {
    if (!quiz || !quiz.offen) return;
    quiz.offen = false;
    const eintrag = quiz.liste[quiz.position];
    const aufgabe = eintrag.aufgabe;
    const karte = eintrag.karte;
    const richtig = aufgabe.optionen[index].richtig;
    PK.antwortBuchen(stand, karte.id, richtig, Date.now());
    sichern();
    $('quiz-antworten').querySelectorAll('button').forEach((knopf, i) => {
      knopf.classList.add('gesperrt');
      if (aufgabe.optionen[i].richtig) knopf.classList.add('richtig');
      else if (i === index) knopf.classList.add('falsch');
      else knopf.classList.add('blass');
    });
    // Gezählt wird nur der erste Versuch. Wer daneben liegt, bekommt die Karte am Ende der Runde noch einmal.
    if (!eintrag.wiederholung) {
      if (richtig) {
        quiz.richtig += 1;
      } else {
        quiz.verfehlt.push(karte);
        quiz.liste.push({ karte: karte, wiederholung: true });
      }
    }
    balkenSetzen('quiz-balken', quiz.position + 1, quiz.liste.length);
    const box = $('quiz-rueckmeldung');
    box.dataset.ergebnis = richtig ? 'richtig' : 'falsch';
    $('quiz-titel').textContent = richtig ? 'Richtig!' : 'Nicht ganz.';
    $('quiz-loesung-begriff').textContent = karte.begriff;
    $('quiz-loesung-bedeutung').textContent = karte.bedeutung;
    beispielSetzen($('quiz-beispiel'), karte.beispiel);
    textSetzen($('quiz-hinweis'), karte.hinweis);
    $('quiz-weiter').textContent = quiz.position + 1 < quiz.liste.length ? 'Weiter' : 'Ergebnis ansehen';
    box.hidden = false;
    $('quiz-titel').focus();
  }

  function quizWeiter() {
    if (!quiz || quiz.offen) return;
    quiz.position += 1;
    if (quiz.position >= quiz.liste.length) {
      ergebnisZeigen(quiz, 'Quiz');
      return;
    }
    quizFrageZeigen();
  }

  // ---------- Karteikarten ----------

  function kartenStarten() {
    kartenLauf = neueRunde();
    kartenLauf.umgedreht = false;
    letzteArt = 'karten';
    kartenKarteZeigen();
    zeige('karten');
  }

  function kartenKarteZeigen() {
    const eintrag = kartenLauf.liste[kartenLauf.position];
    const karte = eintrag.karte;
    kartenLauf.umgedreht = false;
    $('karten-fortschritt').textContent = 'Karte ' + (kartenLauf.position + 1) + ' von ' + kartenLauf.liste.length;
    balkenSetzen('karten-balken', kartenLauf.position, kartenLauf.liste.length);
    $('karte-thema').textContent = karte.kat + (eintrag.wiederholung ? ' · Wiederholung' : '');
    zeilenSetzen($('karte-vorne'), karte.begriff, 'code');
    $('karte-bedeutung').textContent = karte.bedeutung;
    beispielSetzen($('karte-beispiel'), karte.beispiel);
    textSetzen($('karte-hinweis'), karte.hinweis);
    $('karte-hinten').hidden = true;
    $('karte-umdrehen').hidden = false;
    $('karte-bewertung').hidden = true;
  }

  function kartenUmdrehen() {
    if (!kartenLauf || kartenLauf.umgedreht) return;
    kartenLauf.umgedreht = true;
    $('karte-hinten').hidden = false;
    $('karte-umdrehen').hidden = true;
    $('karte-bewertung').hidden = false;
    $('karte-hinten').focus();
  }

  function kartenBewerten(gewusst) {
    if (!kartenLauf || !kartenLauf.umgedreht) return;
    const eintrag = kartenLauf.liste[kartenLauf.position];
    PK.antwortBuchen(stand, eintrag.karte.id, gewusst, Date.now());
    sichern();
    if (!eintrag.wiederholung) {
      if (gewusst) {
        kartenLauf.richtig += 1;
      } else {
        kartenLauf.verfehlt.push(eintrag.karte);
        kartenLauf.liste.push({ karte: eintrag.karte, wiederholung: true });
      }
    }
    kartenLauf.position += 1;
    if (kartenLauf.position >= kartenLauf.liste.length) {
      ergebnisZeigen(kartenLauf, 'Karteikarten');
      return;
    }
    kartenKarteZeigen();
  }

  // ---------- Ergebnis ----------

  function ergebnisZeigen(lauf, art) {
    $('ergebnis-art').textContent = art + ' · ' + themaName(lauf.thema);
    $('ergebnis-zahl').textContent = lauf.richtig + ' von ' + lauf.erste + (art === 'Quiz' ? ' richtig' : ' gewusst');
    $('ergebnis-text').textContent = PK.ergebnisText(lauf.richtig, lauf.erste);
    const liste = $('ergebnis-liste');
    liste.textContent = '';
    lauf.verfehlt.forEach((karte) => {
      const punkt = el('li', '', '');
      punkt.appendChild(el('code', '', karte.begriff));
      punkt.appendChild(el('span', '', karte.bedeutung));
      liste.appendChild(punkt);
    });
    $('ergebnis-liste-titel').hidden = lauf.verfehlt.length === 0;
    liste.hidden = lauf.verfehlt.length === 0;
    zeige('ergebnis');
    $('ergebnis-zahl').focus();
  }

  // ---------- Nachschlagen ----------

  let nachschlagenBereit = false;

  function sucheText(karte) {
    return (karte.begriff + ' ' + karte.bedeutung + ' ' + karte.beispiel + ' ' + karte.hinweis).toLowerCase();
  }

  function nachschlagenFiltern() {
    const suchwort = $('suche').value.trim().toLowerCase();
    const thema = $('suche-thema').value || PK.ALLE;
    const treffer = PK.kartenVon(thema, KARTEN).filter((karte) => !suchwort || sucheText(karte).indexOf(suchwort) !== -1);
    const liste = $('suche-liste');
    liste.textContent = '';
    treffer.forEach((karte) => {
      const punkt = el('li', '', '');
      const details = el('details', 'nachschlagen-karte', '');
      const kopf = el('summary', '', '');
      kopf.appendChild(el('code', 'nachschlagen-begriff', karte.begriff));
      kopf.appendChild(el('span', 'nachschlagen-bedeutung', karte.bedeutung));
      if (PK.eintrag(stand, karte.id).s >= PK.STUFE_SICHER) kopf.appendChild(el('span', 'marke', 'sicher'));
      details.appendChild(kopf);
      const inhalt = el('div', 'nachschlagen-inhalt', '');
      if (karte.beispiel) {
        const beispiel = el('pre', 'beispiel', '');
        zeilenSetzen(beispiel, karte.beispiel, 'code');
        inhalt.appendChild(beispiel);
      }
      if (karte.hinweis) inhalt.appendChild(el('p', 'hinweis', karte.hinweis));
      inhalt.appendChild(el('p', 'kategorie', karte.kat));
      details.appendChild(inhalt);
      punkt.appendChild(details);
      liste.appendChild(punkt);
    });
    $('suche-info').textContent =
      treffer.length === 0 ? 'Keine Karte gefunden.' : treffer.length + (treffer.length === 1 ? ' Karte' : ' Karten');
  }

  function nachschlagenZeigen() {
    if (!nachschlagenBereit) {
      const auswahl = $('suche-thema');
      [PK.ALLE].concat(PK.themen(KARTEN)).forEach((name) => {
        const option = el('option', '', themaName(name));
        option.value = name;
        auswahl.appendChild(option);
      });
      nachschlagenBereit = true;
    }
    $('suche-thema').value = stand.thema;
    nachschlagenFiltern();
    zeige('nachschlagen');
  }

  // iPhone und iPad nehmen für den Startbildschirm kein SVG. Darum zeichnet die Seite das Symbol einmal als PNG und trägt es als Apple-Symbol ein.
  // Geht das schief, bleibt es beim Standard des Geräts und die App läuft trotzdem.
  function symbolFuerIphone() {
    try {
      const bild = new Image();
      bild.onload = () => {
        try {
          const leinwand = document.createElement('canvas');
          leinwand.width = 180;
          leinwand.height = 180;
          leinwand.getContext('2d').drawImage(bild, 0, 0, 180, 180);
          const link = document.createElement('link');
          link.rel = 'apple-touch-icon';
          link.href = leinwand.toDataURL('image/png');
          document.head.appendChild(link);
        } catch (fehler) {
          // Zeichnen nicht erlaubt.
        }
      };
      bild.src = 'icon.svg';
    } catch (fehler) {
      // Kein Bild möglich.
    }
  }

  // ---------- Verdrahten ----------

  $('quiz-starten').addEventListener('click', quizStarten);
  $('karten-starten').addEventListener('click', kartenStarten);
  $('nachschlagen-starten').addEventListener('click', nachschlagenZeigen);
  $('quiz-pause').addEventListener('click', startZeigen);
  $('quiz-weiter').addEventListener('click', quizWeiter);
  $('karten-pause').addEventListener('click', startZeigen);
  $('karte-umdrehen').addEventListener('click', kartenUmdrehen);
  $('karteikarte').addEventListener('click', kartenUmdrehen);
  $('karte-nochmal').addEventListener('click', () => kartenBewerten(false));
  $('karte-gewusst').addEventListener('click', () => kartenBewerten(true));
  $('ergebnis-nochmal').addEventListener('click', () => {
    if (letzteArt === 'karten') kartenStarten();
    else quizStarten();
  });
  $('ergebnis-start').addEventListener('click', startZeigen);
  $('nachschlagen-zurueck').addEventListener('click', startZeigen);
  $('suche').addEventListener('input', nachschlagenFiltern);
  $('suche-thema').addEventListener('change', nachschlagenFiltern);
  $('neu-laden').addEventListener('click', () => window.location.reload());
  $('zuruecksetzen').addEventListener('click', () => {
    if (!window.confirm('Den ganzen Fortschritt auf diesem Gerät löschen?')) return;
    stand = PK.leererStand();
    PK.standLoeschen(speicher, KEY);
    startZeigen();
  });

  // Menüleiste oben und Statusleiste unten. Sie sind Zierde mit Nutzen und fehlen nicht schlimm: Ohne sie läuft die App weiter.
  function wennDa(id, tat) {
    const knoten = $(id);
    if (knoten) knoten.addEventListener('click', tat);
  }
  wennDa('menue-datei', startZeigen);
  wennDa('menue-suchen', nachschlagenZeigen);
  wennDa('menue-ansicht', designWechseln);
  wennDa('menue-ausfuehren', quizStarten);
  wennDa('design-knopf', designWechseln);

  // Am Rechner: im Quiz mit 1 bis 4 oder A bis D antworten, mit Enter weiter.
  document.addEventListener('keydown', (ereignis) => {
    if (ereignis.ctrlKey || ereignis.metaKey || ereignis.altKey) return;
    const ziel = ereignis.target;
    const tag = ziel && ziel.tagName ? ziel.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!quiz || $('quiz').hidden) return;
    const taste = String(ereignis.key || '').toLowerCase();
    if (quiz.offen && Object.prototype.hasOwnProperty.call(TASTEN, taste)) {
      const index = TASTEN[taste];
      if (index < quiz.liste[quiz.position].aufgabe.optionen.length) quizAntwort(index);
    } else if (!quiz.offen && taste === 'enter' && tag !== 'BUTTON') {
      quizWeiter();
    }
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  try {
    designAnwenden();
  } catch (fehler) {
    // Das Design ist nur Zierde: Geht etwas schief, läuft die App trotzdem.
  }
  symbolFuerIphone();
  startZeigen();
})();

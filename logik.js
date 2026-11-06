// Logik von Python Karten: Fortschritt, Auswahl der Karten und Bau der Quizfragen.
// Hier steckt nichts, was die Seite anfasst. So kann pruefen.html die Regeln ohne Oberfläche testen.
(function (global) {
  'use strict';

  const SPEICHER_KEY = 'python-karten-fortschritt-v1';
  // Eine Karte gilt als sicher, wenn sie dreimal hintereinander richtig beantwortet wurde.
  const STUFE_SICHER = 3;
  // So viele Karten hat eine Runde.
  const RUNDE = 10;
  const ALLE = 'Alle';
  // Je höher die Stufe, desto seltener kommt die Karte dran. Neue und gerade verfehlte Karten (Stufe 0) am häufigsten.
  const GEWICHTE = [5, 3, 2, 1];

  // Reihenfolge der Themen und die Fragetexte im Quiz. Ein Thema, das hier fehlt, bekommt allgemeine Texte.
  const THEMEN = [
    { name: 'Symbole', vor: 'Was bedeutet dieses Zeichen?', zurueck: 'Welches Zeichen passt zu dieser Beschreibung?' },
    { name: 'Schlüsselwörter', vor: 'Wofür steht dieses Schlüsselwort?', zurueck: 'Welches Schlüsselwort ist gemeint?' },
    { name: 'Funktionen', vor: 'Was macht diese Funktion?', zurueck: 'Welche Funktion ist gemeint?' },
    { name: 'Methoden', vor: 'Was macht diese Methode?', zurueck: 'Welche Methode ist gemeint?' },
    { name: 'Dateien & Daten', vor: 'Was bedeutet das?', zurueck: 'Welcher Ausdruck ist gemeint?' },
    { name: 'Fehler', vor: 'Was bedeutet dieser Fehler?', zurueck: 'Welcher Fehler ist gemeint?' },
    { name: 'Begriffe', vor: 'Was bedeutet dieser Begriff?', zurueck: 'Welcher Begriff ist gemeint?' }
  ];

  function zahl(wert, min, max) {
    const n = Math.floor(Number(wert));
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function themaInfo(name) {
    for (let i = 0; i < THEMEN.length; i += 1) {
      if (THEMEN[i].name === name) return THEMEN[i];
    }
    return { name: name, vor: 'Was bedeutet das?', zurueck: 'Welcher Ausdruck ist gemeint?' };
  }

  // Die Themen der Karten in der festen Reihenfolge von THEMEN, unbekannte Themen hinten dran.
  function themen(karten) {
    const vorhanden = Object.create(null);
    karten.forEach((k) => { vorhanden[k.kat] = true; });
    const liste = THEMEN.map((t) => t.name).filter((n) => vorhanden[n]);
    karten.forEach((k) => {
      if (liste.indexOf(k.kat) === -1) liste.push(k.kat);
    });
    return liste;
  }

  function kartenVon(thema, karten) {
    if (!thema || thema === ALLE) return karten.slice();
    return karten.filter((k) => k.kat === thema);
  }

  // ---------- Fortschritt ----------

  function leererStand() {
    return { v: 1, thema: ALLE, karten: {} };
  }

  // speicher ist localStorage (oder ein Ersatz mit getItem/setItem/removeItem, im Test). Ohne Speicher startet die App leer.
  function standLaden(speicher, key) {
    const leer = leererStand();
    if (!speicher) return leer;
    try {
      const roh = speicher.getItem(key || SPEICHER_KEY);
      if (!roh) return leer;
      const daten = JSON.parse(roh);
      if (!daten || daten.v !== 1 || typeof daten.karten !== 'object' || daten.karten === null) return leer;
      const stand = leererStand();
      if (typeof daten.thema === 'string') stand.thema = daten.thema;
      Object.keys(daten.karten).forEach((id) => {
        const e = daten.karten[id];
        if (e && typeof e === 'object') {
          stand.karten[id] = { s: zahl(e.s, 0, STUFE_SICHER), r: zahl(e.r, 0, 1000000), f: zahl(e.f, 0, 1000000), t: zahl(e.t, 0, 1e15) };
        }
      });
      return stand;
    } catch (fehler) {
      return leer;
    }
  }

  function standSichern(speicher, stand, key) {
    if (!speicher) return false;
    try {
      speicher.setItem(key || SPEICHER_KEY, JSON.stringify(stand));
      return true;
    } catch (fehler) {
      return false;
    }
  }

  function standLoeschen(speicher, key) {
    if (!speicher) return false;
    try {
      speicher.removeItem(key || SPEICHER_KEY);
      return true;
    } catch (fehler) {
      return false;
    }
  }

  // s = Stufe (0 bis 3), r = richtig, f = falsch, t = Zeitpunkt der letzten Antwort
  function eintrag(stand, id) {
    return stand.karten[id] || { s: 0, r: 0, f: 0, t: 0 };
  }

  // Richtig: eine Stufe höher. Falsch: zurück auf Stufe 0.
  function antwortBuchen(stand, id, richtig, jetzt) {
    const alt = eintrag(stand, id);
    const neu = {
      s: richtig ? Math.min(STUFE_SICHER, alt.s + 1) : 0,
      r: alt.r + (richtig ? 1 : 0),
      f: alt.f + (richtig ? 0 : 1),
      t: jetzt || 0
    };
    stand.karten[id] = neu;
    return neu;
  }

  function zaehlen(stand, karten) {
    let sicher = 0;
    let gesehen = 0;
    karten.forEach((k) => {
      const e = stand.karten[k.id];
      if (!e) return;
      if (e.r + e.f > 0) gesehen += 1;
      if (e.s >= STUFE_SICHER) sicher += 1;
    });
    return { gesamt: karten.length, sicher: sicher, gesehen: gesehen };
  }

  // ---------- Auswahl ----------

  function gewicht(e) {
    return GEWICHTE[Math.min(STUFE_SICHER, Math.max(0, e.s))];
  }

  function mischen(liste, zufall) {
    const rnd = zufall || Math.random;
    const kopie = liste.slice();
    for (let i = kopie.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(rnd() * (i + 1)));
      const t = kopie[i];
      kopie[i] = kopie[j];
      kopie[j] = t;
    }
    return kopie;
  }

  // Zieht anzahl verschiedene Karten. Karten mit niedriger Stufe haben die größere Chance.
  function rundeZiehen(karten, stand, anzahl, zufall) {
    const rnd = zufall || Math.random;
    const rest = karten.slice();
    const gezogen = [];
    const n = Math.min(anzahl, rest.length);
    while (gezogen.length < n) {
      let summe = 0;
      const gew = rest.map((k) => {
        const g = gewicht(eintrag(stand, k.id));
        summe += g;
        return g;
      });
      let treffer = rnd() * summe;
      let index = 0;
      while (index < rest.length - 1 && treffer >= gew[index]) {
        treffer -= gew[index];
        index += 1;
      }
      gezogen.push(rest[index]);
      rest.splice(index, 1);
    }
    return gezogen;
  }

  // Neue und verfehlte Karten zuerst als "Begriff gezeigt, Bedeutung gesucht", bekannte Karten auch andersherum.
  function richtungWaehlen(e, zufall) {
    const rnd = zufall || Math.random;
    if (e.r + e.f === 0 || e.s === 0) return 'vor';
    return rnd() < 0.5 ? 'vor' : 'zurueck';
  }

  // ---------- Quizfragen ----------

  // richtung 'vor': der Begriff steht oben, vier Bedeutungen zur Wahl.
  // richtung 'zurueck': die Bedeutung steht oben, vier Begriffe zur Wahl.
  // Falsche Antworten kommen aus demselben Thema, und keine zeigt denselben Text wie die richtige.
  function aufgabeBauen(karte, richtung, alle, zufall) {
    const rnd = zufall || Math.random;
    const vor = richtung !== 'zurueck';
    const feld = vor ? 'bedeutung' : 'begriff';
    const info = themaInfo(karte.kat);
    const gleich = alle.filter((k) => k.id !== karte.id && k.kat === karte.kat);
    const andere = alle.filter((k) => k.id !== karte.id && k.kat !== karte.kat);
    const benutzt = Object.create(null);
    benutzt[karte[feld]] = true;
    const falsch = [];
    mischen(gleich, rnd).concat(mischen(andere, rnd)).forEach((k) => {
      if (falsch.length < 3 && !benutzt[k[feld]]) {
        benutzt[k[feld]] = true;
        falsch.push(k);
      }
    });
    const optionen = mischen([karte].concat(falsch), rnd).map((k) => ({
      id: k.id,
      text: k[feld],
      richtig: k.id === karte.id
    }));
    return {
      id: karte.id,
      kat: karte.kat,
      richtung: vor ? 'vor' : 'zurueck',
      frage: vor ? info.vor : info.zurueck,
      anzeige: vor ? karte.begriff : karte.bedeutung,
      anzeigeCode: vor,
      antwortCode: !vor,
      optionen: optionen
    };
  }

  function ergebnisText(richtig, gesamt) {
    if (gesamt <= 0) return '';
    const anteil = richtig / gesamt;
    if (anteil >= 1) return 'Alles richtig.';
    if (anteil >= 0.8) return 'Stark, nur wenig daneben.';
    if (anteil >= 0.5) return 'Gut dabei. Die Karten unten kommen bald wieder.';
    return 'Das braucht noch ein paar Runden. Die Karten unten kommen bald wieder.';
  }

  // ---------- Farben für Code (wie im Editor) ----------

  function mengeAus(woerter) {
    const menge = Object.create(null);
    woerter.split(' ').forEach((w) => { menge[w] = true; });
    return menge;
  }

  const SCHLUESSELWOERTER = mengeAus('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield');
  const EINGEBAUT = mengeAus('abs all any bool bytes chr dict dir enumerate filter float format frozenset getattr hasattr help id input int isinstance iter len list map max min next object open ord print range repr reversed round set setattr sorted str sum super tuple type zip');
  const FEHLERART = /^[A-Z][A-Za-z]*(?:Error|Exception|Warning)$/;
  const TEXT_VORSATZ = /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/;

  // Wo ein Text in Anführungszeichen endet. pos zeigt auf das öffnende Zeichen.
  // Ohne Ende reicht ein einfacher Text bis zum Zeilenende, einer mit drei Anführungszeichen bis zum Ende des Ganzen.
  function textEnde(text, pos) {
    const q = text.charAt(pos);
    const n = text.length;
    if (text.slice(pos, pos + 3) === q + q + q) {
      const stop = text.indexOf(q + q + q, pos + 3);
      return stop === -1 ? n : stop + 3;
    }
    let k = pos + 1;
    while (k < n) {
      const z = text.charAt(k);
      if (z === '\\') {
        k += 2;
      } else if (z === q) {
        return k + 1;
      } else if (z === '\n') {
        return k;
      } else {
        k += 1;
      }
    }
    return n;
  }

  // Zerlegt Python-Text in Zeilen aus Stücken { t: Art, s: Text }. Daraus färbt die Seite den Code.
  // Arten: kw Schlüsselwort, fn eingebaute Funktion oder Fehlerart, df Name nach def oder class, st Text in Anführungszeichen,
  // nr Zahl, ko Kommentar, op Rechenzeichen, pu Klammer oder Satzzeichen, txt alles andere (auch Leerraum).
  // Es geht nichts verloren: Alle Stücke einer Zeile ergeben zusammen genau diese Zeile, und es gibt so viele Zeilen wie im Text.
  function zerlegen(text) {
    const t = typeof text === 'string' ? text : '';
    const stuecke = [];
    // davor ist das letzte Wort oder Zeichen ohne Leerraum. Es entscheidet, ob ein Name nach "def" oder nach einem Punkt steht.
    let davor = '';
    function ein(art, s) {
      const letztes = stuecke[stuecke.length - 1];
      if (letztes && letztes.t === art) letztes.s += s;
      else stuecke.push({ t: art, s: s });
    }
    const muster = /(\s+)|(#[^\n]*)|([A-Za-z_][A-Za-z0-9_]*)|(\d+(?:\.\d+)?)|("|')|(==|!=|<=|>=|\/\/=?|\*\*=?|[-+*\/%]=?|[<>=])|([()[\]{}:,.;])|([\s\S])/g;
    let m;
    while ((m = muster.exec(t)) !== null) {
      if (m[1] !== undefined) {
        ein('txt', m[1]);
      } else if (m[2] !== undefined) {
        ein('ko', m[2]);
        davor = '#';
      } else if (m[3] !== undefined) {
        const wort = m[3];
        const naechstes = t.charAt(muster.lastIndex);
        if ((naechstes === '"' || naechstes === "'") && TEXT_VORSATZ.test(wort)) {
          // f"..." oder r"...": der Buchstabe gehört zum Text
          const ende = textEnde(t, muster.lastIndex);
          ein('st', t.slice(m.index, ende));
          muster.lastIndex = ende;
          davor = '"';
        } else {
          let art = 'txt';
          if (davor === '.') art = 'txt';
          else if (davor === 'def' || davor === 'class') art = 'df';
          else if (SCHLUESSELWOERTER[wort]) art = 'kw';
          else if (EINGEBAUT[wort] || FEHLERART.test(wort)) art = 'fn';
          ein(art, wort);
          davor = wort;
        }
      } else if (m[4] !== undefined) {
        ein('nr', m[4]);
        davor = m[4];
      } else if (m[5] !== undefined) {
        const ende = textEnde(t, m.index);
        ein('st', t.slice(m.index, ende));
        muster.lastIndex = ende;
        davor = '"';
      } else if (m[6] !== undefined) {
        ein('op', m[6]);
        davor = m[6];
      } else if (m[7] !== undefined) {
        ein('pu', m[7]);
        davor = m[7];
      } else {
        ein('txt', m[8]);
        davor = m[8];
      }
    }
    // In Zeilen teilen. Nur Leerraum und Text mit drei Anführungszeichen enthalten Zeilenumbrüche.
    const zeilen = [[]];
    stuecke.forEach((stueck) => {
      stueck.s.split('\n').forEach((teil, i) => {
        if (i > 0) zeilen.push([]);
        if (teil !== '') zeilen[zeilen.length - 1].push({ t: stueck.t, s: teil });
      });
    });
    return zeilen;
  }

  global.PK = {
    SPEICHER_KEY: SPEICHER_KEY,
    STUFE_SICHER: STUFE_SICHER,
    RUNDE: RUNDE,
    ALLE: ALLE,
    THEMEN: THEMEN,
    themaInfo: themaInfo,
    themen: themen,
    kartenVon: kartenVon,
    leererStand: leererStand,
    standLaden: standLaden,
    standSichern: standSichern,
    standLoeschen: standLoeschen,
    eintrag: eintrag,
    antwortBuchen: antwortBuchen,
    zaehlen: zaehlen,
    mischen: mischen,
    rundeZiehen: rundeZiehen,
    richtungWaehlen: richtungWaehlen,
    aufgabeBauen: aufgabeBauen,
    ergebnisText: ergebnisText,
    zerlegen: zerlegen
  };
})(window);

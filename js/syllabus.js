/* תחקיר — the training syllabus, kept in the app as a reference.
 *
 * One entry per גיחה. `items` are the חתך rows for that גיחה, which become the
 * סילבוס of a תדריך automatically when נושא טיסה matches. The מיקוד and הערות
 * columns of the source chart are deliberately not carried here.
 *
 * Everything stays editable after it is filled in: this only saves the typing.
 */
(function (g) {
  'use strict';

  var ALIASES = {
    'אווירובטיקה': 'AW'
  };

  /* Populated from the squadron syllabus chart.
     { name: 'AW 1', items: ['...', '...'] } */
  var FLIGHTS = [];

  /** Fold away the things that vary between the chart and a phone keyboard:
   *  gershayim vs a straight quote, hyphen styles, double spaces, case, and
   *  whether a number is joined to its word. The chart writes "AW3" while he
   *  types "AW 3", so a letter/digit boundary always becomes a space and both
   *  forms land on the same key. */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[״׳"']/g, '"')
      .replace(/[־‐-―_-]/g, ' ')
      .replace(/([a-z֐-׿])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z֐-׿])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** אווירובטיקה and AW are the same thing, so either spelling matches. */
  function applyAliases(s) {
    var out = s;
    Object.keys(ALIASES).forEach(function (k) {
      out = out.split(norm(k)).join(norm(ALIASES[k]));
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  /**
   * Find the syllabus entry for what he typed into נושא טיסה.
   *
   * Three ways to match, in order:
   *   1. exactly            "AW 3"      -> AW 3
   *   2. he typed MORE      "AW 3 לילה" -> AW 3      (extra categories on the flight)
   *   3. he typed LESS      "ניווט 5"   -> ניווט 5 - עובדה חזור
   *
   * Case 3 is not a nicety. Ten גיחות in the chart carry a description after the
   * number — "ניווט 5 - עובדה חזור", "לילה 5 צ׳ק סולו לילה", "מאמן 6 - מבחן במאמן" —
   * and nobody types those. Without it they simply never matched and the סילבוס
   * stayed empty with no hint why.
   *
   * It only counts when it lands on ONE entry. "מבנה" alone fits nine of them,
   * and guessing which is worse than filling nothing.
   *
   * Every comparison is on whole tokens, so "AW 3" can never reach "AW 30".
   */
  function lookup(subject) {
    var want = applyAliases(norm(subject));
    if (!want) return null;

    var exact = null, shorter = null, longer = [];
    FLIGHTS.forEach(function (f) {
      var key = applyAliases(norm(f.name));
      if (!key) return;
      if (key === want) { exact = f; return; }
      if (want.indexOf(key + ' ') === 0) {
        // he typed more than the name; the longest name that still fits wins
        if (!shorter || key.length > applyAliases(norm(shorter.name)).length) shorter = f;
        return;
      }
      if (key.indexOf(want + ' ') === 0) longer.push(f);
    });

    return exact || shorter || (longer.length === 1 ? longer[0] : null);
  }

  g.SyllabusRef = {
    aliases: ALIASES,
    all: function () { return FLIGHTS; },
    count: function () { return FLIGHTS.length; },
    lookup: lookup,
    norm: norm,
    /** Replace the catalogue wholesale, used when the chart is updated. */
    load: function (list) {
      FLIGHTS = (list || []).map(function (f) {
        return {
          name: String(f.name || '').trim(),
          section: String(f.section || '').trim(),
          items: (f.items || []).map(function (i) { return String(i).trim(); }).filter(Boolean)
        };
      }).filter(function (f) { return f.name; });
      return FLIGHTS.length;
    }
  };
})(window);

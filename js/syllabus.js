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
   * "AW 3" matches AW 3. "AW 3 לילה" also matches AW 3, because a flight can
   * carry extra categories beyond the one that names the גיחה.
   */
  function lookup(subject) {
    var want = applyAliases(norm(subject));
    if (!want) return null;

    var exact = null, prefix = null;
    FLIGHTS.forEach(function (f) {
      var key = applyAliases(norm(f.name));
      if (!key) return;
      if (key === want) { exact = f; return; }
      // whole-token prefix, so "AW 3" never matches "AW 30"
      if (want.indexOf(key + ' ') === 0) {
        if (!prefix || key.length > applyAliases(norm(prefix.name)).length) prefix = f;
      }
    });
    return exact || prefix;
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

const assert=require('assert/strict'),{plan}=require('../tools/access.cjs');
const source="window.AUTH_CONFIG={clientId:'unchanged',allow: [\n    ], courses: {\n    },sessionDays:30};";
const added=plan(source,[],{action:'add',email:'synthetic@example.invalid',name:'Test User',course:'mitkadem'});
assert.equal(added.count,1);assert.equal(added.roster[0].label,'Test');assert.ok(!added.source.includes('@'));assert.ok(added.source.includes("clientId:'unchanged'"));
assert.equal(plan(added.source,added.roster,{action:'add',email:'synthetic@example.invalid',name:'Test',course:'mitkadem'}).count,1);
assert.equal(plan(added.source,added.roster,{action:'remove',email:'synthetic@example.invalid'}).count,0);
assert.throws(()=>plan(source,[],{action:'add',email:'synthetic@example.invalid',name:'Test',course:'invented'}));
console.log('4 private access-tool checks passed (synthetic data; no files changed)');

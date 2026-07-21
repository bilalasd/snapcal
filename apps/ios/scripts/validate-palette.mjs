// FINAL RESOLUTION TEST.
// on-target/over revert to green/crimson (semantically right, and they clear
// vermilion + the macro ramp). Their mutual green-vs-red CVD collision is
// resolved NOT by color but by a REDUNDANT NON-COLOR CHANNEL, which WCAG 1.4.1
// requires anyway. Verify each color is individually safe against everything
// it can be seen NEXT TO; mutual on-target/over separation is then carried by
// shape+text, not hue.
const hex2rgb=(h)=>{h=h.replace(/^#/,"");return [0,2,4].map(i=>parseInt(h.substr(i,2),16));};
const rgb2hex=(r,g,b)=>"#"+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
const s2l=(c)=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const l2s=(c)=>255*(c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055);
const lum=(h)=>{const[r,g,b]=hex2rgb(h).map(s2l);return 0.2126*r+0.7152*g+0.0722*b;};
const contrast=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const lab=(h)=>{const[r,g,b]=hex2rgb(h).map(s2l);let x=(0.4124*r+0.3576*g+0.1805*b)/0.95047,y=0.2126*r+0.7152*g+0.0722*b,z=(0.0193*r+0.1192*g+0.9505*b)/1.08883;const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;[x,y,z]=[f(x),f(y),f(z)];return[116*y-16,500*(x-y),200*(y-z)];};
const dE=(a,b)=>{const[l1,a1,b1]=lab(a),[l2,a2,b2]=lab(b);return Math.hypot(l1-l2,a1-a2,b1-b2);};
const dL=(a,b)=>Math.abs(lab(a)[0]-lab(b)[0]);
const cvd=(hex,t)=>{const[r,g,b]=hex2rgb(hex).map(s2l);const L=0.31399*r+0.63951*g+0.04649*b,M=0.15537*r+0.75789*g+0.08670*b,S=0.01775*r+0.10945*g+0.87262*b;let l=L,m=M,s=S;
if(t==="deuter")m=0.9513092*L+0.04866992*S; if(t==="protan")l=1.05118294*M-0.05116099*S; if(t==="tritan")s=-0.86744736*L+1.86727089*M;
return rgb2hex(l2s(Math.max(0,Math.min(1,5.47221206*l-4.6419601*m+0.16963708*s))),l2s(Math.max(0,Math.min(1,-1.1252419*l+2.29317094*m-0.1678952*s))),l2s(Math.max(0,Math.min(1,0.02980165*l-0.19318073*m+1.16364789*s))));};
const V=["normal","deuter","protan","tritan"];
const sim=(h,v)=>v==="normal"?h:cvd(h,v);
const VERM="#e64a19";
const P={light:{bg:"#ffffff",protein:"#16307A",carbs:"#3D5CB8",fat:"#7286D8",onTarget:"#116149",over:"#A5003C"},
         dark:{bg:"#0c0c0c",protein:"#B9CCFF",carbs:"#7E9BE8",fat:"#4A63B5",onTarget:"#4ECB92",over:"#FF6FA0"}};
let fail=0;
for(const[t,c] of Object.entries(P)){
  console.log(`\n=== ${t.toUpperCase()} ===`);
  console.log(" contrast vs bg (>=3:1):");
  for(const k of ["protein","carbs","fat","onTarget","over"]){
    const ct=contrast(c[k],c.bg),ok=ct>=3; if(!ok)fail++;
    console.log(`   ${k.padEnd(9)} ${c[k]} ${ct.toFixed(2).padStart(5)}:1 ${ok?"PASS":"FAIL"}${ct>=4.5?" text-safe":""}`);
  }
  console.log(" macro ramp dL (co-visible, all CVD):");
  for(const v of V){let w=Infinity;for(const[i,j] of [["protein","carbs"],["carbs","fat"],["protein","fat"]]){const d=dL(sim(c[i],v),sim(c[j],v));if(d<w)w=d;}
    const ok=w>=12; if(!ok)fail++; console.log(`   ${v.padEnd(7)} ${w.toFixed(1).padStart(5)} ${ok?"ok":"FAIL"}`);}
  // Status vs vermilion is a HARD gate: the log button is co-visible on every
  // screen, and nothing may be confusable with "log something".
  console.log(" each status vs vermilion (hard gate, co-visible everywhere):");
  for(const s of ["onTarget","over"]){
    let wv=Infinity; for(const v of V){const d=dE(sim(c[s],v),sim(VERM,v));if(d<wv)wv=d;}
    const ok=wv>=20; if(!ok)fail++;
    console.log(`   ${s.padEnd(9)} min dE ${wv.toFixed(1).padStart(5)} ${ok?"ok":"FAIL"}`);
  }

  // The next two are NOT hue failures — they are the two pairs the spec
  // resolves with a mandated non-color channel (spec §3.3). They are reported
  // as REQUIREMENTS, not failures, because no hue choice fixes them:
  //   - onTarget/over is the green-red collapse (a blue onTarget was tested
  //     and then collided with the blue macro ramp instead).
  //   - onTarget sits near the macro ramp under worst-case CVD.
  // Colors alone can't clear these; labels/symbols must. Flipping them to
  // hard failures would only invite someone to "fix" them by picking a hue
  // that quietly breaks something else.
  console.log(" mandated non-color channels (WCAG 1.4.1 — rule, not hue):");
  let wo=Infinity; for(const v of V){const d=dE(sim(c.onTarget,v),sim(c.over,v));if(d<wo)wo=d;}
  console.log(`   onTarget vs over        min dE ${wo.toFixed(1).padStart(5)} -> symbol/text REQUIRED wherever co-visible`);
  let wm=Infinity; for(const m of ["protein","carbs","fat"]) for(const v of V){const d=dE(sim(c.onTarget,v),sim(c[m],v));if(d<wm)wm=d;}
  console.log(`   onTarget vs macro ramp  min dE ${wm.toFixed(1).padStart(5)} -> never adjacent unlabelled`);
}
console.log(`\n${fail===0?"*** PASS — values valid; non-color channels above are mandatory in code ***":fail+" HARD FAILURE(S)"}`);
process.exit(fail===0?0:1);

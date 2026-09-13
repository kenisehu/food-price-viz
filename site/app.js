const DATA_URL = "data/school-lunch-fees.json";
const yen = new Intl.NumberFormat("ja-JP");

fetch(DATA_URL).then(r=>{if(!r.ok)throw new Error("data");return r.json()}).then(render).catch(()=>{
  document.querySelector("#chart").textContent="データを読み込めませんでした。";
});

function render(data){
  renderTable(data); renderSources(data); renderChart(data);
  addEventListener("resize",debounce(()=>renderChart(data),120));
}
function renderTable(data){
  document.querySelector("#data-table").innerHTML=data.map(d=>`<tr><td>${d.year}年度</td><td>${yen.format(d.elementary)}円</td><td>${yen.format(d.juniorHigh)}円</td></tr>`).join("");
}
function renderSources(data){
  const unique=[...new Map(data.map(d=>[d.sourceUrl,d])).values()];
  document.querySelector("#sources").innerHTML=unique.map(d=>`<li><span class="org">出典：${d.source}</span><a href="${d.sourceUrl}" target="_blank" rel="noopener noreferrer">「${d.sourceTitle}」</a></li>`).join("");
}
function renderChart(data){
  const host=document.querySelector("#chart"), mobile=host.clientWidth<620;
  const W=Math.max(host.clientWidth,320),H=mobile?350:430,m={t:18,r:mobile?14:26,b:48,l:mobile?56:72};
  const years=Array.from({length:20},(_,i)=>2006+i), minY=3500,maxY=6500;
  const x=y=>m.l+(y-2006)*(W-m.l-m.r)/19, y=v=>m.t+(maxY-v)*(H-m.t-m.b)/(maxY-minY);
  const byYear=new Map(data.map(d=>[+d.year,d]));
  const ticks=[3500,4000,4500,5000,5500,6000,6500];
  const labels=mobile?years.filter(v=>(v-2006)%4===0||v===2025):years.filter(v=>(v-2006)%2===0||v===2025);
  const segments=key=>{let out=[],cur=[];years.forEach(yr=>{const d=byYear.get(yr);if(d){cur.push([x(yr),y(d[key])]);}else if(cur.length){out.push(cur);cur=[];}});if(cur.length)out.push(cur);return out};
  const path=pts=>pts.map((p,i)=>`${i?"L":"M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  let svg=`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  ticks.forEach(t=>svg+=`<line x1="${m.l}" y1="${y(t)}" x2="${W-m.r}" y2="${y(t)}" stroke="#dfe5eb"/><text x="${m.l-12}" y="${y(t)+5}" text-anchor="end" fill="#647182" font-size="${mobile?12:13}">${yen.format(t)}</text>`);
  svg+=`<text x="${m.l}" y="11" fill="#647182" font-size="12">円／月</text>`;
  labels.forEach(t=>svg+=`<text x="${x(t)}" y="${H-17}" text-anchor="middle" fill="#647182" font-size="${mobile?11:12}">${t}</text>`);
  [["elementary","#167d9a"],["juniorHigh","#d96532"]].forEach(([key,color])=>{
    segments(key).forEach(s=>svg+=`<path d="${path(s)}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    data.forEach(d=>svg+=`<circle cx="${x(+d.year)}" cy="${y(d[key])}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"/>`);
  });
  data.forEach(d=>svg+=`<rect class="hit" data-year="${d.year}" x="${x(+d.year)-Math.max(11,(W-m.l-m.r)/40)}" y="${m.t}" width="${Math.max(22,(W-m.l-m.r)/20)}" height="${H-m.t-m.b}" fill="transparent" tabindex="0" aria-label="${d.year}年度、小学校${yen.format(d.elementary)}円、中学校${yen.format(d.juniorHigh)}円"/>`);
  svg+=`</svg><div class="tooltip" hidden></div>`; host.innerHTML=svg;
  const tip=host.querySelector(".tooltip");
  host.querySelectorAll(".hit").forEach(hit=>{
    const show=()=>{const d=byYear.get(+hit.dataset.year);tip.innerHTML=`<strong>${d.year}年度</strong><span>小学校　${yen.format(d.elementary)}円</span><span>中学校　${yen.format(d.juniorHigh)}円</span>`;tip.hidden=false;tip.style.left=`${Math.min(Math.max(x(+d.year),95),W-95)}px`;tip.style.top=`${Math.min(y(d.juniorHigh),y(d.elementary))}px`};
    hit.addEventListener("mouseenter",show);hit.addEventListener("focus",show);hit.addEventListener("click",show);hit.addEventListener("mouseleave",()=>tip.hidden=true);hit.addEventListener("blur",()=>tip.hidden=true);
  });
}
function debounce(fn,wait){let id;return()=>{clearTimeout(id);id=setTimeout(fn,wait)}}

const cache=new Map<string,string>();
// Keep CAD hues while giving pale lines enough contrast on the light blue canvas.
export function drawingColor(color:string):string{
 const cached=cache.get(color);if(cached)return cached;
 let rgb:number[];
 if(color.startsWith('hsl')){
  const [h,s,l]=color.match(/[\d.]+/g)!.map(Number),a=s/100*Math.min(l/100,1-l/100);
  rgb=[0,8,4].map(n=>{const k=(n+h/30)%12;return 255*(l/100-a*Math.max(-1,Math.min(k-3,9-k,1)));});
 }else if(/^#[0-9a-f]{6}$/i.test(color))rgb=[1,3,5].map(n=>parseInt(color.slice(n,n+2),16));else return '#344b62';
 const luminance=(values:number[])=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const background=luminance([232,242,251]);
 while((background+.05)/(luminance(rgb)+.05)<3.5)rgb=rgb.map(v=>v*.9);
 const adapted=`#${rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}`;cache.set(color,adapted);return adapted;
}

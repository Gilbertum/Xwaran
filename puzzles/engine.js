/* Pure geometry helpers; shared by browser game and Node tests. */
(function(root){
  'use strict';
  function clamp(value,low,high){return Math.max(low,Math.min(high,value))}
  function integer(value,min,max,fallback){let n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback}
  function layout(w,h,cols,rows){const ratio=clamp(w/h,.25,4);const width=Math.min(720,405*ratio);const height=width/ratio;return {x:(1200-width)/2,y:48,width,height,cw:width/cols,ch:height/rows,cols,rows}}
  function target(index,cols){return {x:index%cols,y:Math.floor(index/cols)}}
  function snapped(index,cols,x,y,threshold=.34){const t=target(index,cols);return Number.isFinite(x)&&Number.isFinite(y)&&Math.hypot(x-t.x,y-t.y)<=threshold}
  function edgeSign(type,row,col){let k=((row+1)*73856093)^((col+1)*19349663)^(type==='h'?83492791:49979687);k=(k^(k>>>13))>>>0;return (k&1)?1:-1}
  function initialPieces(cols,rows){const total=cols*rows;const across=Math.max(cols+3,7);return Array.from({length:total},(_,index)=>({piece_index:index,x:-1.35+(index%across)*((cols+2.7)/(across-1)),y:rows+.48+Math.floor(index/across)*.65,locked:false,moved_by:null}))}
  function piecePath(ctx,col,row,cellW,cellH,cols,rows){
    const amp=Math.min(cellW,cellH)*.22;
    const drawEdge=(ax,ay,bx,by,sign)=>{
      const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len;
      const point=(t,normal=0)=>[ax+dx*t+nx*normal,ay+dy*t+ny*normal];
      const line=(t,o=0)=>{const p=point(t,o);ctx.lineTo(...p)};
      const bez=(a,b,c,d,e,f)=>{ctx.bezierCurveTo(...point(a,b),...point(c,d),...point(e,f))};
      if(!sign){line(1);return}
      line(.29);bez(.33,0,.37,-sign*amp*.24,.40,-sign*amp*.28);bez(.36,-sign*amp*.94,.42,-sign*amp*1.27,.50,-sign*amp*1.27);bez(.58,-sign*amp*1.27,.64,-sign*amp*.94,.60,-sign*amp*.28);bez(.63,-sign*amp*.24,.67,0,.71,0);line(1);
    };
    ctx.beginPath();ctx.moveTo(0,0);
    drawEdge(0,0,cellW,0,row===0?0:-edgeSign('h',row-1,col));
    drawEdge(cellW,0,cellW,cellH,col===cols-1?0:edgeSign('v',row,col));
    drawEdge(cellW,cellH,0,cellH,row===rows-1?0:edgeSign('h',row,col));
    drawEdge(0,cellH,0,0,col===0?0:-edgeSign('v',row,col-1));
    ctx.closePath();
  }
  root.PuzzleEngine={clamp,integer,layout,target,snapped,edgeSign,initialPieces,piecePath};
})(typeof window==='undefined'?globalThis:window);

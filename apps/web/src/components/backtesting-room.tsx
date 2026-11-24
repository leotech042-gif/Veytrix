"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketCandle, MarketInstrument } from "@veytrix/shared";
import { getMarketInstruments } from "@/lib/market-data-api";

type Trade = {
  id:string; direction:"bullish"|"bearish"; timeframe:string; entryTime:string;
  exitTime:string|null; entry:number; stopLoss:number; takeProfit:number;
  riskReward:number; realizedR:number|null; outcome:"win"|"loss"|"open";
  tags:string[]; explanation:string; entryIndex:number; exitIndex:number|null;
};
type Summary = {trades:number;wins:number;losses:number;open:number;winRate:number;netR:number;averageR:number;maxDrawdownR:number};
type Segment = {trades:Trade[];summary:Summary};
type Result = {instrument:string;entryTimeframe:string;analysisTimeframes:string[];period:{from:string;to:string};data:MarketCandle[];backtest:Segment;forward:Segment;limitations:string[]};
const apiUrl=process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000/api";
const dateValue=(d:Date)=>d.toISOString().slice(0,10);

function Metric({label,value}:{label:string;value:string}){return <div className="bt-metric"><span>{label}</span><strong>{value}</strong></div>}

function CandleChart({candles,trade}:{candles:MarketCandle[];trade:Trade|null}){
 const width=1100,height=390;
 const chart=useMemo(()=>{
  if(!candles.length)return null;
  const prices=candles.flatMap(c=>[c.low,c.high]);
  if(trade)prices.push(trade.entry,trade.stopLoss,trade.takeProfit);
  const min=Math.min(...prices),max=Math.max(...prices);
  const pad=(max-min)*.08||Math.abs(max)*.001||.00001,lo=min-pad,hi=max+pad;
  return {y:(p:number)=>height-((p-lo)/(hi-lo))*height,step:width/candles.length};
 },[candles,trade]);
 if(!chart)return <div className="bt-chart-empty">No historical candles loaded.</div>;
 const level=(price:number,label:string,color:string)=><g key={label}><line x1="0" x2={width} y1={chart.y(price)} y2={chart.y(price)} stroke={color} strokeDasharray="7 5"/><text x="8" y={Math.max(14,chart.y(price)-5)} fill={color} fontSize="12">{label+" "+price}</text></g>;
 return <div className="bt-chart-wrap"><svg className="bt-chart" viewBox={"0 0 "+width+" "+height} role="img" aria-label="Historical candles and selected strategy setup">
  {[0,1,2,3,4].map(n=><line key={n} x1="0" x2={width} y1={height*n/4} y2={height*n/4} className="bt-gridline"/>)}
  {candles.map((c,i)=>{const x=i*chart.step+chart.step/2,up=c.close>=c.open,color=up?"#26a69a":"#ef5350",top=chart.y(Math.max(c.open,c.close)),bottom=chart.y(Math.min(c.open,c.close)),w=Math.max(1,Math.min(7,chart.step*.62));return <g key={c.time}><line x1={x} x2={x} y1={chart.y(c.high)} y2={chart.y(c.low)} stroke={color}/><rect x={x-w/2} y={top} width={w} height={Math.max(1,bottom-top)} fill={color}/>{trade&&i===trade.entryIndex&&<circle cx={x} cy={chart.y(c.close)} r="5" fill="#a7ff4f" stroke="#101820" strokeWidth="2"/>}</g>})}
  {trade&&<>{level(trade.entry,"ENTRY","#a7ff4f")}{level(trade.stopLoss,"SL","#ef5350")}{level(trade.takeProfit,"TP","#26a69a")}</>}
 </svg><div className="bt-chart-axis"><span>{new Date(candles[0].time).toLocaleString()}</span><span>{new Date(candles[candles.length-1].time).toLocaleString()}</span></div></div>;
}

function TestPanel({title,segment}:{title:string;segment:Segment}){
 const s=segment.summary;
 return <section className="bt-test-panel"><div className="bt-panel-heading"><h3>{title}</h3><span>{s.trades} setups</span></div><div className="bt-metrics">
  <Metric label="Win rate" value={s.winRate+"%"}/><Metric label="Wins" value={String(s.wins)}/><Metric label="Losses" value={String(s.losses)}/><Metric label="Open" value={String(s.open)}/><Metric label="Net R" value={s.netR+"R"}/><Metric label="Average R" value={s.averageR+"R"}/><Metric label="Max drawdown" value={s.maxDrawdownR+"R"}/>
 </div></section>;
}

export function BacktestingRoom(){
 const [instruments,setInstruments]=useState<MarketInstrument[]>([]);
 const [instrument,setInstrument]=useState("EURUSD");
 const [from,setFrom]=useState(()=>dateValue(new Date(Date.now()-6*86400000)));
 const [to,setTo]=useState(()=>dateValue(new Date()));
 const [result,setResult]=useState<Result|null>(null);
 const [selected,setSelected]=useState<Trade|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [tab,setTab]=useState<"backtest"|"forward">("backtest");
 useEffect(()=>{let active=true;getMarketInstruments().then(items=>{if(!active)return;const supported=items.filter(x=>x.category==="forex"||x.category==="metals");setInstruments(supported);if(supported.length&&!supported.some(x=>x.symbol===instrument))setInstrument(supported[0].symbol)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load instruments")});return()=>{active=false}},[]);
 const trades=tab==="backtest"?(result?.backtest.trades??[]):(result?.forward.trades??[]);
 async function runTest(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setLoading(true);setError("");setResult(null);setSelected(null);try{const q=new URLSearchParams({instrument,from:new Date(from+"T00:00:00.000Z").toISOString(),to:new Date(to+"T23:59:59.999Z").toISOString()});const response=await fetch(apiUrl+"/backtesting/run?"+q,{cache:"no-store"});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(typeof body?.message==="string"?body.message:"Backtest request failed");setResult(body as Result)}catch(err){setError(err instanceof Error?err.message:"Backtest failed")}finally{setLoading(false)}}
 return <div className="backtesting-room">
  <header className="bt-header"><div><span className="bt-eyebrow">TEMPORARY STRATEGY EVALUATION</span><h1>Backtesting Room</h1><p>Test Veytrix setups against historical candles. No live orders.</p></div><span className="bt-paper-label">PAPER TEST ONLY</span></header>
  <form className="bt-controls" onSubmit={runTest}>
   <label>Currency pair<select value={instrument} onChange={e=>setInstrument(e.target.value)}>{instruments.map(x=><option key={x.symbol} value={x.symbol}>{x.symbol}</option>)}</select></label>
   <label>From<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} required/></label>
   <label>To<input type="date" value={to} min={from} max={dateValue(new Date())} onChange={e=>setTo(e.target.value)} required/></label>
   <button type="submit" disabled={loading||!instruments.length}>{loading?"Testing…":"Run strategy test"}</button>
  </form>
  {error&&<div className="bt-error" role="alert">{error}</div>}
  {loading&&<div className="bt-loading" role="status">Fetching real candles and evaluating setups chronologically…</div>}
  {result&&<>
   <div className="bt-result-meta"><strong>{result.instrument}</strong><span>Entry timeframe · {result.entryTimeframe}</span><span>Top-down: {result.analysisTimeframes.join(" → ")}</span><span>{new Date(result.period.from).toLocaleDateString()} – {new Date(result.period.to).toLocaleDateString()}</span></div>
   <div className="bt-tabs"><button type="button" className={tab==="backtest"?"active":""} onClick={()=>{setTab("backtest");setSelected(null)}}>Historical backtest</button><button type="button" className={tab==="forward"?"active":""} onClick={()=>{setTab("forward");setSelected(null)}}>Out-of-sample forward test</button></div>
   <TestPanel title={tab==="backtest"?"Historical results":"Forward results · unseen segment"} segment={tab==="backtest"?result.backtest:result.forward}/>
   <section className="bt-chart-panel"><div className="bt-panel-heading"><h3>Price action & detected setup</h3><span>{selected?selected.direction.toUpperCase()+" · "+selected.outcome.toUpperCase():"Select a setup below"}</span></div><CandleChart candles={result.data} trade={selected}/>
    {selected&&<div className="bt-setup-details"><div><span>Setup found</span><strong>{selected.explanation}</strong></div><div className="bt-levels"><span>Entry <b>{selected.entry}</b></span><span>SL <b>{selected.stopLoss}</b></span><span>TP <b>{selected.takeProfit}</b></span><span>Planned RR <b>1:{selected.riskReward}</b></span></div><div className="bt-tags">{selected.tags.map(tag=><span key={tag}>{tag.replaceAll("_"," ")}</span>)}</div></div>}
   </section>
   <section className="bt-trade-list"><div className="bt-panel-heading"><h3>{tab==="backtest"?"Historical setups":"Forward setups"}</h3><span>Choose a row to inspect its chart levels</span></div>
    {!trades.length?<p className="bt-no-trades">No valid setups were found in this segment. Veytrix did not manufacture entries.</p>:<div className="bt-trade-rows">{trades.map(t=><button type="button" key={t.id} className={selected?.id===t.id?"selected":""} onClick={()=>setSelected(t)}><span>{t.direction==="bullish"?"BUY":"SELL"} · {new Date(t.entryTime).toLocaleString()}</span><span>{t.outcome.toUpperCase()}</span><span>1:{t.riskReward}</span><span>{t.realizedR===null?"Unresolved":(t.realizedR>0?"+":"")+t.realizedR+"R"}</span></button>)}</div>}
   </section>
   <section className="bt-limitations"><h3>Testing notes</h3><ul>{result.limitations.map(x=><li key={x}>{x}</li>)}</ul></section>
  </>}
 </div>;
}

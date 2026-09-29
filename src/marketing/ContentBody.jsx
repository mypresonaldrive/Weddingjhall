import React from 'react';
export function splitBody(body=''){return body.split(/\n(?=## )/).filter(Boolean).map(part=>{const lines=part.split('\n');return lines[0].startsWith('## ')?{heading:lines.shift().slice(3),text:lines.join('\n')}:{heading:'',text:part};});}
// Intentionally plain text: no dangerouslySetInnerHTML, raw HTML or embedded script support.
export function ArticleBody({body}){return <div className="mk-prose">{splitBody(body).map((part,i)=><section key={i}>{part.heading&&<h2>{part.heading}</h2>}{part.text.split('\n').filter(Boolean).map((line,j)=><p key={j}>{line}</p>)}</section>)}</div>;}

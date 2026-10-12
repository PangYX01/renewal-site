function money(v){return `RM${Number(v||0).toFixed(2)}`;}

export function invoiceNumber(row){
  return `INV-${String(row.entry_number||row.id||0).padStart(6,'0')}`;
}

function paymentMethodLabel(method){
  const m=String(method||'').trim();
  if(!m)return 'Billplz';
  if(m.toLowerCase()==='billplz')return 'Billplz';
  return m.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

function labelForKey(k,label){
  if(label && !['compound','info','colored'].includes(String(label).toLowerCase()))return label;
  return ({
    compound:'Late Compound / Penalty Refundable Deposit',
    info:'Business & Owner(s) Information',
    colored:'Borang D CTC Colored Certificate (HQ Only)',
    branches:'Branch Renewal Fee'
  }[k]||label||'Payment item');
}

export function buildPaymentItems(row){
  let stored=row.payment_items;
  if(typeof stored==='string'){try{stored=JSON.parse(stored)}catch{stored=null}}
  if(Array.isArray(stored)&&stored.length){
    return stored.map(it=>{
      const amount=Number(it.line_total ?? it.amount ?? it.price ?? 0);
      const qty=Math.max(0,Number(it.quantity ?? 1));
      return {
        name:String(labelForKey(String(it.key||''),it.name||it.label||'Payment item')),
        quantity:qty,
        price:Number(it.price ?? (qty?amount/qty:amount)),
        line_total:amount
      };
    });
  }

  const items=[];
  const years=Math.max(1,Number(row.renewal_years||1));
  const renewal=Number(row.renewal_amount||0);
  if(renewal>0)items.push({name:`SSM Renewal (${years} year${years===1?'':'s'})`,quantity:1,price:renewal,line_total:renewal});

  const branches=Number(row.branches||0),branchFee=Number(row.branch_fee||0);
  if(branches>0||branchFee>0)items.push({name:'Branch Renewal Fee',quantity:Math.max(1,branches),price:branches>0?branchFee/branches:branchFee,line_total:branchFee});

  const selected=[];
  if(String(row.late_compound||'').toLowerCase()==='yes')selected.push(['compound','Late Compound / Penalty Refundable Deposit',120]);
  if(String(row.business_info||'').toLowerCase()==='yes')selected.push(['info','Business & Owner(s) Information',30]);
  if(String(row.colored_certificate||'').toLowerCase()==='yes')selected.push(['colored','Borang D CTC Colored Certificate (HQ Only)',50]);
  let remaining=Number(row.addon_total||0);
  selected.forEach(([key,name,configured],index)=>{
    const isLast=index===selected.length-1;
    let price=isLast&&Math.abs(remaining-configured)>.01?Math.max(0,remaining):Math.min(Math.max(0,configured),Math.max(0,remaining));
    if(remaining<=0)price=configured;
    items.push({name,quantity:1,price,line_total:price});
    remaining-=price;
  });

  if(!items.length){const total=Number(row.total_amount||0);items.push({name:'Payment item',quantity:1,price:total,line_total:total});}
  return items;
}

function pdfEscape(text){return String(text??'').replace(/[^\x20-\x7E]/g,' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}

const NORMAL=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function pdfTextWidth(text,size,bold=false){
  const metrics=bold?BOLD:NORMAL;let total=0;
  for(const ch of String(text??'')){
    const code=ch.charCodeAt(0);
    total+=(code>=32&&code<=126)?metrics[code-32]:500;
  }
  return total/1000*size;
}

function pdfText(x,y,size,value,bold=false,align='left'){
  const t=String(value??'');const width=pdfTextWidth(t,size,bold);
  if(align==='right')x-=width;if(align==='center')x-=width/2;
  return `BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(t)}) Tj ET\n`;
}
function pdfLine(x1,y1,x2,y2,width=.7){return `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;}
function pdfRect(x,y,w,h,fill=false){return fill?`0.95 0.96 0.97 rg ${x} ${y} ${w} ${h} re f 0 0 0 rg\n`:`${x} ${y} ${w} ${h} re S\n`;}

function invoiceCompany(){
  return {
    name:process.env.COMPANY_NAME||'ONE STOP RENEW SDN BHD',
    reg:process.env.COMPANY_REG||'202501045057',
    phone:process.env.COMPANY_PHONE||'+60123226211',
    email:process.env.COMPANY_EMAIL||'contact@onestop-ssm4u.com.my'
  };
}

function invoiceLabels(){
  return {
    invoice_number_label:process.env.INVOICE_NUMBER_LABEL||'Invoice No.',
    date_label:process.env.INVOICE_DATE_LABEL||'Date',
    from_label:process.env.INVOICE_FROM_LABEL||'Invoice from:',
    to_label:process.env.INVOICE_TO_LABEL||'Invoice to:',
    item_label:process.env.INVOICE_ITEM_LABEL||'Item',
    quantity_label:process.env.INVOICE_QUANTITY_LABEL||'Quantity',
    price_label:process.env.INVOICE_PRICE_LABEL||'Price',
    line_total_label:process.env.INVOICE_LINE_TOTAL_LABEL||'Line Total',
    total_label:process.env.INVOICE_TOTAL_LABEL||'Total Amount:',
    payment_type_label:process.env.INVOICE_PAYMENT_TYPE_LABEL||'Payment Type:',
    footer_note:process.env.INVOICE_FOOTER_NOTE||''
  };
}


function formatMalaysiaPhone(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const compact=raw.replace(/[\s()-]/g,'');
  if(/^\+60\d+$/.test(compact))return compact;
  if(/^60\d+$/.test(compact))return `+${compact}`;
  if(/^0\d+$/.test(compact))return `+60${compact.slice(1)}`;
  return raw;
}

function malaysiaLongDate(raw){
  const d=new Date(raw||Date.now());
  return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Kuala_Lumpur'}).format(d);
}

// Direct standalone port of the WordPress plugin's generate_invoice_pdf_legacy() layout.
export function invoicePdf(row){
  const company=invoiceCompany();
  const items=buildPaymentItems(row);
  const inv=invoiceNumber(row);
  const p=invoiceLabels();
  const date=malaysiaLongDate(row.updated_at||row.created_at);
  let s='';

  s+=pdfText(545,795,10,p.invoice_number_label,true,'right');
  s+=pdfText(545,768,24,inv,true,'right');
  s+=pdfText(545,744,10,`${p.date_label}: ${date}`,false,'right');

  s+=pdfText(50,675,10,p.from_label,true);
  s+=pdfText(50,650,12,company.name,true);
  s+=pdfText(50,633,10,company.reg);
  s+=pdfText(50,616,10,company.phone);
  s+=pdfText(50,599,10,company.email);

  s+=pdfText(315,675,10,p.to_label,true);
  s+=pdfText(315,650,12,row.business_name||row.customer_name||'',true);
  s+=pdfText(315,633,10,row.registration_number||'');
  s+=pdfText(315,616,10,formatMalaysiaPhone(row.phone));
  s+=pdfText(315,599,10,row.email||'');

  const top=535,rh=28;
  s+=pdfRect(50,top-rh,495,rh,true);
  s+=pdfRect(50,top-rh,495,rh,false);
  for(const vx of [330,405,475])s+=pdfLine(vx,top-rh,vx,top);
  s+=pdfText(60,top-18,10,p.item_label,true);
  s+=pdfText(367,top-18,10,p.quantity_label,true,'center');
  s+=pdfText(440,top-18,10,p.price_label,true,'center');
  s+=pdfText(535,top-18,10,p.line_total_label,true,'right');

  let y=top-rh;
  for(const item of items){
    y-=rh;
    s+=pdfRect(50,y,495,rh,false);
    for(const vx of [330,405,475])s+=pdfLine(vx,y,vx,y+rh);
    const name=String(item.name||'').slice(0,48);
    s+=pdfText(60,y+10,9,name);
    s+=pdfText(367,y+10,9,item.quantity,false,'center');
    s+=pdfText(440,y+10,9,money(item.price),false,'center');
    s+=pdfText(535,y+10,9,money(item.line_total),false,'right');
  }

  const summaryY=Math.max(115,y-70);
  s+=pdfText(50,summaryY,10,p.total_label,true);
  s+=pdfText(145,summaryY-4,22,money(row.total_amount),true);
  s+=pdfText(50,summaryY-42,10,p.payment_type_label,true);
  s+=pdfText(150,summaryY-42,10,paymentMethodLabel(row.payment_method||'billplz'));

  const footer=String(p.footer_note||'').trim();
  if(footer){
    let footerY=summaryY-70;
    for(const line of footer.split(/\r?\n/)){
      if(footerY<42)break;
      s+=pdfText(50,footerY,9,String(line).slice(0,105));
      footerY-=14;
    }
  }

  const objects=[
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(s,'binary')} >> stream\n${s}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj'
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(const obj of objects){offsets.push(Buffer.byteLength(pdf,'binary'));pdf+=obj+'\n';}
  const xref=Buffer.byteLength(pdf,'binary'),count=objects.length+1;
  pdf+=`xref\n0 ${count}\n0000000000 65535 f \n`;
  for(let i=1;i<count;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer << /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,'binary');
}

export function invoiceFilename(row){
  return `payment-invoice-${invoiceNumber(row)}.pdf`;
}

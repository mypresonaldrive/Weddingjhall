export const DURATION_OPTIONS = [
 {value:'full',label:'Full day',hint:'00:00–24:00',start:'00:00',end:'00:00'},
 {value:'morning',label:'Morning',hint:'08:00–14:00',start:'08:00',end:'14:00'},
 {value:'afternoon',label:'Afternoon',hint:'14:00–20:00',start:'14:00',end:'20:00'},
 {value:'evening',label:'Evening',hint:'17:00–23:00',start:'17:00',end:'23:00'},
 {value:'multiple',label:'Multiple days',hint:'Full days, inclusive'},
 {value:'custom',label:'Custom timing',hint:'Choose start and end'},
];
const DAY=86400000;
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export const nextDate=date=>new Date(Date.parse(date)+DAY).toISOString().slice(0,10);
export function bookingDuration(input) {
 if(!validDate(input.date))throw Error('Choose a valid event date.');
 const mode=input.durationMode||'full',option=DURATION_OPTIONS.find(o=>o.value===mode);
 if(!option)throw Error('Choose a valid booking duration.');
 const lastDate=['multiple','custom'].includes(mode)?input.endDate||input.date:input.date;
 if(!validDate(lastDate)||lastDate<input.date)throw Error('End date must be on or after the start date.');
 let startTime=option.start||'00:00',endTime=option.end||'00:00';
 if(mode==='custom'){
  startTime=input.time;endTime=input.bookingEndTime;
  if(![startTime,endTime].every(t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Enter a valid booking start and end time.');
 }
 const endDate=['full','multiple'].includes(mode)?nextDate(lastDate):lastDate;
 const start=Date.parse(input.date+'T'+startTime+':00Z'),end=Date.parse(endDate+'T'+endTime+':00Z');
 if(end<=start)throw Error('Booking end must be after its start. For overnight events, choose the next end date.');
 if(end-start>31*DAY)throw Error('A booking may reserve up to 31 days.');
 const days=mode==='custom'?Math.ceil((end-Date.parse(input.date+'T00:00:00Z'))/DAY):mode==='multiple'?Math.round((end-start)/DAY):1;
 return {mode,label:option.label,startDate:input.date,endDate,startTime,endTime,start,end,days,rentalUnits:days,rateKey:['morning','afternoon','evening'].includes(mode)?mode+'Price':'price'};
}
// Legacy records without duration continue to block their entire event date.
export function bookingsOverlap(a,b){const x=bookingDuration(a),y=bookingDuration(b);return x.start<y.end&&y.start<x.end;}
export function occupiesDate(booking,date){try{return bookingsOverlap(booking,{date});}catch{return booking.date===date;}}
export function durationDescription(input){try{const d=bookingDuration(input);return `${d.label} · ${d.startDate} ${d.startTime} → ${d.endDate} ${d.endTime}${d.days>1?` · ${d.days} rental days`:''}`;}catch{return 'Choose a valid booking duration';}}
export function matchesDateRange(booking,from,to){try{const d=bookingDuration(booking);return (!from||d.end>Date.parse(from+'T00:00:00Z'))&&(!to||d.start<Date.parse(nextDate(to)+'T00:00:00Z'));}catch{return (!from||booking.date>=from)&&(!to||booking.date<=to);}}

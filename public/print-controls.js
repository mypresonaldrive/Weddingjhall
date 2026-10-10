// Static print control: no booking data is interpolated into JavaScript.
document.getElementById('print-confirmation')?.addEventListener('click', () => window.print());

document.getElementById('compact-print')?.addEventListener('change', event => {document.body.classList.toggle('compact-print',event.target.checked);});

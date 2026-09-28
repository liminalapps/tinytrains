// Dev: summarize /api/{city}/trains for each city.
for (const c of process.argv.slice(2).length ? process.argv.slice(2) : ['nyc', 'sf', 'london', 'tokyo']) {
  const j = await (await fetch(`http://localhost:8787/api/${c}/trains`)).json();
  const byLine = {};
  for (const t of j.trains) byLine[t.line] = (byLine[t.line] ?? 0) + 1;
  console.log(`== ${c}: ${j.trains.length} trains`, JSON.stringify(j.sources.map((s) => [s.id, s.ok, s.trains, s.error ?? ''])));
  console.log('   ', JSON.stringify(byLine));
}

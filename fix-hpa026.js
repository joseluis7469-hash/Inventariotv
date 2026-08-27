// Script para eliminar los últimos 2 movimientos de HPA-026 y restaurar ubicación
// Ejecutar en la consola del navegador (F12 → Console) estando en la app

(async () => {
  const db = firebase.firestore();
  
  // 1. Buscar el TV HPA-026
  const tvSnap = await db.collection('tvs').where('codigo', '==', 'HPA-026').get();
  if (tvSnap.empty) { console.error('No se encontró HPA-026'); return; }
  const tvDoc = tvSnap.docs[0];
  const tvId = tvDoc.id;
  console.log('TV:', tvId, tvDoc.data().codigo, tvDoc.data().ubicacion);

  // 2. Buscar TODOS los movimientos de este TV
  const movSnap = await db.collection('movimientos').where('tvId', '==', tvId).get();
  
  if (movSnap.empty) { console.log('No hay movimientos para HPA-026'); return; }

  // 3. Ordenar por creadoEn y tomar los 2 más recientes
  const movs = movSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  movs.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
  
  console.log(`Total movimientos: ${movs.length}`);
  console.log('Últimos 2:');
  movs.slice(0, 2).forEach(m => console.log(`  - ${m.tipo} → ${m.destino} (${m.creadoEn})`));

  // 4. Eliminar los 2 más recientes
  const batch = db.batch();
  movs.slice(0, 2).forEach(m => {
    console.log('  Eliminando:', m.id);
    batch.delete(m.ref);
  });
  
  // 5. Restaurar ubicación del TV a Taller
  batch.update(tvDoc.ref, {
    ubicacion: 'Taller',
    habitacion: '',
    piso: '',
    estado: 'taller',
    tallerEstado: 'inoperativo'
  });
  
  await batch.commit();
  console.log('✅ Movimientos eliminados y TV restaurado a Taller');
  console.log('Recarga la página (F5).');
})();

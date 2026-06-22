/**
 * Importación del Excel de "KO altas".
 * - POST /api/ko/import → recibe un .xlsx (multipart, campo `file`), lee la hoja
 *   de datos (`default_1` o, si no existe, la de más filas) y cruza cada fila
 *   contra el catálogo POR CONTENCIÓN del error: una cuenta es "conocida" si la
 *   frase de UN KO del catálogo (`ko_entries.error`) está contenida en su
 *   "Error normalizado". Si no cruza con ninguno, o cruza con varios (ambiguo),
 *   queda como "desconocida" (pendiente de normalizar). Sin IA.
 *
 * Respuestas:
 * - 201 `{ lote }` cuando se importa (los casos se recargan desde el server).
 * - 200 `{ needsColumn: true, columnas }` si no se pudo detectar la columna del
 *   error: el cliente reenvía con `columna_error`.
 * - 4xx/5xx con `{ error }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db, ko_entries, ko_import_lotes, ko_import_casos } from '@/db';
import type { NewKoImportCaso } from '@/db';
import { buildKoIndex, createKoMatcher, ecoNotesDeFila } from '@/lib/ko-match';

export const maxDuration = 60;

type Fila = Record<string, string | number | null>;

/** Normaliza una cabecera para comparar: minúsculas, sin acentos ni separadores. */
function normHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .trim();
}

/** Elige qué hoja contiene los datos: `default_1` si existe, si no la de más filas. */
function elegirHoja(wb: XLSX.WorkBook): string {
  const porNombre = wb.SheetNames.find((n) => normHeader(n) === 'default1');
  if (porNombre) return porNombre;
  let mejor = wb.SheetNames[0];
  let max = -1;
  for (const n of wb.SheetNames) {
    const rango = wb.Sheets[n]['!ref'];
    const filas = rango ? XLSX.utils.decode_range(rango).e.r : 0;
    if (filas > max) {
      max = filas;
      mejor = n;
    }
  }
  return mejor;
}

/**
 * Columna del "Error normalizado": el ÚNICO criterio de cruce. Todas las filas
 * con el mismo "Error normalizado" reciben el mismo veredicto (no se separan por
 * el mensaje crudo). Si no se detecta, se pide al usuario que la elija.
 */
function detectarColumnaError(headers: string[], pedida: string | null): string | null {
  if (pedida && headers.includes(pedida)) return pedida;
  return headers.find((h) => normHeader(h) === 'errornormalizado') ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const columnaPedida = form.get('columna_error');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file requerido (multipart)' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'máximo 10MB' }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: 'buffer' });
    } catch {
      return NextResponse.json({ error: 'No se pudo leer el archivo como Excel' }, { status: 422 });
    }
    if (wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'El Excel no tiene hojas' }, { status: 422 });
    }

    const hoja = elegirHoja(wb);
    const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[hoja], { defval: null, raw: false });
    if (filas.length === 0) {
      return NextResponse.json({ error: `La hoja "${hoja}" está vacía o sin cabeceras` }, { status: 422 });
    }

    const headers = Object.keys(filas[0]);
    const columnaError = detectarColumnaError(
      headers,
      typeof columnaPedida === 'string' ? columnaPedida : null
    );
    if (!columnaError) {
      // No pudimos decidir la columna: que el usuario la elija y reintente.
      return NextResponse.json({ needsColumn: true, columnas: headers });
    }

    // Cruce por contención cacheado por "Error normalizado" (mismo texto → mismo veredicto).
    const catalogo = await db.select().from(ko_entries);
    const matchUnico = createKoMatcher(buildKoIndex(catalogo));

    let conocidas = 0;
    const casosPre = filas.map((fila) => {
      const raw = fila[columnaError];
      const errorTexto = raw == null || String(raw).trim() === '' ? null : String(raw).trim();

      // Cruce por "Error normalizado"; desempate por ECO_Notes si cruza con varios.
      const ko = matchUnico(errorTexto, ecoNotesDeFila(fila));
      if (ko) conocidas++;

      return {
        fila,
        errorTexto,
        codigo: ko?.codigo ?? null,
        koId: ko?.id ?? null,
      };
    });
    const desconocidas = casosPre.length - conocidas;

    const [lote] = await db
      .insert(ko_import_lotes)
      .values({
        nombre_archivo: file.name || 'import.xlsx',
        total: casosPre.length,
        conocidas,
        desconocidas,
        columna_codigo: columnaError,
      })
      .returning();

    const values: NewKoImportCaso[] = casosPre.map((c) => ({
      lote_id: lote.id,
      fila: c.fila,
      error_texto: c.errorTexto,
      codigo: c.codigo,
      tipo: c.koId ? 'conocida' : 'desconocida',
      ko_entry_id: c.koId,
    }));

    // Insertamos por bloques para no rozar el límite de parámetros de Postgres.
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
      await db.insert(ko_import_casos).values(values.slice(i, i + CHUNK));
    }

    return NextResponse.json({ lote, hoja }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

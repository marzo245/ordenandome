/**
 * Importación del Excel de "KO altas".
 * - POST /api/ko/import → recibe un .xlsx (multipart, campo `file`), lee SOLO la
 *   hoja 1, detecta la columna de código y cruza cada fila POR CÓDIGO EXACTO
 *   contra el catálogo (`ko_entries.codigo`). Persiste un lote + sus casos.
 *
 * Respuestas:
 * - 201 `{ lote, casos }` cuando se importa.
 * - 200 `{ needsColumn: true, columnas }` si no se pudo detectar la columna de
 *   código sin ambigüedad: el cliente reenvía con `columna_codigo`.
 * - 4xx/5xx con `{ error }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db, ko_entries, ko_import_lotes, ko_import_casos } from '@/db';
import type { NewKoImportCaso } from '@/db';

export const maxDuration = 60;

type Fila = Record<string, string | number | null>;

/** Normaliza una cabecera/código para comparar: minúsculas, sin acentos ni separadores. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .trim();
}

/** Normaliza un código para el cruce (tolerante a may/min y espacios, conserva guiones). */
function normCodigo(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

// Cabeceras candidatas a "columna de código" (ya normalizadas con norm()).
const CANDIDATAS_CODIGO = ['codigo', 'cod', 'coderror', 'codigoerror', 'codigoko', 'codko', 'ko'];

/** Elige qué columna del Excel contiene el código. Devuelve null si es ambiguo. */
function detectarColumnaCodigo(headers: string[], pedida: string | null): string | null {
  if (pedida && headers.includes(pedida)) return pedida;
  const matches = headers.filter((h) => CANDIDATAS_CODIGO.includes(norm(h)));
  // Solo auto-detectamos si hay exactamente una candidata clara.
  return matches.length === 1 ? matches[0] : null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const columnaPedida = form.get('columna_codigo');

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

    const primeraHoja = wb.SheetNames[0];
    if (!primeraHoja) {
      return NextResponse.json({ error: 'El Excel no tiene hojas' }, { status: 422 });
    }
    const ws = wb.Sheets[primeraHoja];
    const filas = XLSX.utils.sheet_to_json<Fila>(ws, { defval: null, raw: false });

    if (filas.length === 0) {
      return NextResponse.json({ error: 'La hoja 1 está vacía o sin cabeceras' }, { status: 422 });
    }

    const headers = Object.keys(filas[0]);
    const columnaCodigo = detectarColumnaCodigo(
      headers,
      typeof columnaPedida === 'string' ? columnaPedida : null
    );
    if (!columnaCodigo) {
      // No pudimos decidir la columna: que el usuario la elija y reintente.
      return NextResponse.json({ needsColumn: true, columnas: headers });
    }

    // Mapa de cruce por código exacto (los KO sin código no entran).
    const catalogo = await db.select().from(ko_entries);
    const porCodigo = new Map<string, string>();
    for (const ko of catalogo) {
      if (ko.codigo) porCodigo.set(normCodigo(ko.codigo), ko.id);
    }

    let conocidas = 0;
    const casosPre = filas.map((fila) => {
      const codigoRaw = fila[columnaCodigo];
      const codigo = codigoRaw == null || codigoRaw === '' ? null : String(codigoRaw).trim();
      const koId = codigo ? porCodigo.get(normCodigo(codigo)) ?? null : null;
      if (koId) conocidas++;
      return { fila, codigo, koId };
    });
    const desconocidas = casosPre.length - conocidas;

    // Persistimos lote + casos.
    const [lote] = await db
      .insert(ko_import_lotes)
      .values({
        nombre_archivo: file.name || 'import.xlsx',
        total: casosPre.length,
        conocidas,
        desconocidas,
        columna_codigo: columnaCodigo,
      })
      .returning();

    const values: NewKoImportCaso[] = casosPre.map((c) => ({
      lote_id: lote.id,
      fila: c.fila,
      codigo: c.codigo,
      tipo: c.koId ? 'conocida' : 'desconocida',
      ko_entry_id: c.koId,
    }));

    const casos = await db.insert(ko_import_casos).values(values).returning();

    return NextResponse.json({ lote, casos }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

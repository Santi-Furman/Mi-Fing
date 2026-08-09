import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ---------- Datos iniciales ---------- */

const MATERIAS_INICIALES = [
  { id: "arqui", nombre: "Arquitectura de Computadoras", sigla: "ARQUI", color: "#004987" },
  { id: "prog3", nombre: "Programación 3", sigla: "PROG3", color: "#E84945" },
  { id: "eco", nombre: "Economía", sigla: "ECO", color: "#C98A1F" },
];

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const TIPOS_CLASE = ["Teórico", "Práctico", "Laboratorio"];
const TIPOS_TAREA = ["Práctico", "Taller", "Entrega", "Parcial", "Lectura"];

const STORAGE_KEY = "fing-tracker-data-v1";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* ---------- Componente principal ---------- */

export default function App() {
  const [materias] = useState(MATERIAS_INICIALES);
  const [clases, setClases] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [vista, setVista] = useState("calendario");
  const [filtro, setFiltro] = useState("todas");
  const [loading, setLoading] = useState(true);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  const [formClase, setFormClase] = useState(null);
  const [formTarea, setFormTarea] = useState(null);
  const [saveError, setSaveError] = useState(false);

  /* cargar datos guardados */
  useEffect(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        setClases(Array.isArray(parsed.clases) ? parsed.clases : []);
        setTareas(Array.isArray(parsed.tareas) ? parsed.tareas : []);
      }
    } catch (e) {
      console.error("Error leyendo localStorage", e);
    } finally {
      setLoading(false);
    }
  }, []);

  /* guardar cada vez que cambian los datos */
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ clases, tareas }));
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, [clases, tareas, loading]);

  const materiaById = useMemo(() => {
    const m = {};
    materias.forEach((mat) => (m[mat.id] = mat));
    return m;
  }, [materias]);

  const materiasVisibles = useMemo(
    () => (filtro === "todas" ? materias : materias.filter((m) => m.id === filtro)),
    [materias, filtro]
  );

  /* ---------- acciones clases ---------- */
  const agregarClase = (c) => setClases((prev) => [...prev, { ...c, id: uid() }]);
  const borrarClase = (id) => setClases((prev) => prev.filter((c) => c.id !== id));

  /* ---------- acciones tareas ---------- */
  const agregarTarea = (t) =>
    setTareas((prev) => [...prev, { ...t, id: uid(), hecho: false }]);
  const borrarTarea = (id) => setTareas((prev) => prev.filter((t) => t.id !== id));
  const toggleTarea = (id) =>
    setTareas((prev) =>
      prev.map((t) => (t.id === id ? { ...t, hecho: !t.hecho } : t))
    );

  const clasesFiltradas =
    filtro === "todas" ? clases : clases.filter((c) => c.materiaId === filtro);
  const tareasFiltradas = (
    filtro === "todas" ? tareas : tareas.filter((t) => t.materiaId === filtro)
  ).slice();

  const pendientes = tareasFiltradas
    .filter((t) => !t.hecho)
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const completadas = tareasFiltradas.filter((t) => t.hecho);

  return (
    <div className="app-root">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="topbar-pattern" aria-hidden="true" />
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">FING</span>
            <h1>Mi Fing</h1>
          </div>
          <p className="brand-sub">Clases, prácticos y talleres de tus materias</p>
        </div>
      </header>

      <nav className="chips">
        <button
          className={"chip" + (filtro === "todas" ? " chip-active" : "")}
          style={filtro === "todas" ? { background: "#323333" } : undefined}
          onClick={() => setFiltro("todas")}
        >
          Todas
        </button>
        {materias.map((m) => (
          <button
            key={m.id}
            className={"chip" + (filtro === m.id ? " chip-active" : "")}
            style={filtro === m.id ? { background: m.color } : { color: m.color, borderColor: m.color }}
            onClick={() => setFiltro(m.id)}
          >
            {m.sigla}
          </button>
        ))}
      </nav>

      <div className="tabs">
        <button
          className={"tab" + (vista === "calendario" ? " tab-active" : "")}
          onClick={() => setVista("calendario")}
        >
          Calendario
        </button>
        <button
          className={"tab" + (vista === "checklist" ? " tab-active" : "")}
          onClick={() => setVista("checklist")}
        >
          Checklist
          {pendientes.length > 0 && <span className="tab-badge">{pendientes.length}</span>}
        </button>
      </div>

      <main className="content">
        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : vista === "calendario" ? (
          <CalendarioView
            dias={DIAS}
            materias={materiasVisibles}
            materiaById={materiaById}
            clases={clasesFiltradas}
            onBorrar={borrarClase}
            formClase={formClase}
            setFormClase={setFormClase}
            onAgregar={agregarClase}
            filtro={filtro}
          />
        ) : (
          <ChecklistView
            materias={materiasVisibles}
            materiaById={materiaById}
            pendientes={pendientes}
            completadas={completadas}
            onToggle={toggleTarea}
            onBorrar={borrarTarea}
            mostrarCompletadas={mostrarCompletadas}
            setMostrarCompletadas={setMostrarCompletadas}
            formTarea={formTarea}
            setFormTarea={setFormTarea}
            onAgregar={agregarTarea}
            filtro={filtro}
          />
        )}
      </main>

      {saveError && (
        <div className="toast-error">No se pudo guardar. Los cambios pueden perderse.</div>
      )}
    </div>
  );
}

/* ---------- Vista Calendario ---------- */

function CalendarioView({ dias, materias, materiaById, clases, onBorrar, formClase, setFormClase, onAgregar, filtro }) {
  const porDia = {};
  dias.forEach((d) => (porDia[d] = []));
  clases.forEach((c) => {
    if (porDia[c.dia]) porDia[c.dia].push(c);
  });
  Object.values(porDia).forEach((lista) =>
    lista.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
  );

  return (
    <div>
      <div className="grid-semana">
        {dias.map((dia) => (
          <div key={dia} className="col-dia">
            <div className="col-dia-header">{dia}</div>
            <div className="col-dia-body">
              {porDia[dia].length === 0 && <p className="muted small">—</p>}
              {porDia[dia].map((c) => {
                const mat = materiaById[c.materiaId];
                return (
                  <div key={c.id} className="clase-card" style={{ borderLeftColor: mat?.color }}>
                    <div className="clase-top">
                      <span className="clase-hora">
                        {c.horaInicio}–{c.horaFin}
                      </span>
                      <button className="mini-x" onClick={() => onBorrar(c.id)} aria-label="Eliminar clase">
                        ×
                      </button>
                    </div>
                    <p className="clase-materia" style={{ color: mat?.color }}>{mat?.sigla}</p>
                    <p className="clase-tipo">{c.tipo}{c.aula ? ` · ${c.aula}` : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {formClase ? (
        <FormClase
          materias={materias}
          filtro={filtro}
          onCancelar={() => setFormClase(null)}
          onGuardar={(c) => {
            onAgregar(c);
            setFormClase(null);
          }}
        />
      ) : (
        <button className="btn-add" onClick={() => setFormClase(true)}>
          + Agregar clase
        </button>
      )}
    </div>
  );
}

function FormClase({ materias, filtro, onCancelar, onGuardar }) {
  const [materiaId, setMateriaId] = useState(filtro !== "todas" ? filtro : materias[0]?.id || "");
  const [dia, setDia] = useState(DIAS[0]);
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("10:00");
  const [tipo, setTipo] = useState(TIPOS_CLASE[0]);
  const [aula, setAula] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!materiaId) return;
    onGuardar({ materiaId, dia, horaInicio, horaFin, tipo, aula: aula.trim() });
  };

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-row">
        <label>
          Materia
          <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Día
          <select value={dia} onChange={(e) => setDia(e.target.value)}>
            {DIAS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_CLASE.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Hora inicio
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
        </label>
        <label>
          Hora fin
          <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
        </label>
        <label>
          Aula (opcional)
          <input type="text" value={aula} onChange={(e) => setAula(e.target.value)} placeholder="Ej: Salón 5" />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primario">Guardar clase</button>
      </div>
    </form>
  );
}

/* ---------- Vista Checklist ---------- */

function ChecklistView({
  materias, materiaById, pendientes, completadas, onToggle, onBorrar,
  mostrarCompletadas, setMostrarCompletadas, formTarea, setFormTarea, onAgregar, filtro,
}) {
  const hoy = hoyISO();

  return (
    <div>
      {formTarea ? (
        <FormTarea
          materias={materias}
          filtro={filtro}
          onCancelar={() => setFormTarea(null)}
          onGuardar={(t) => {
            onAgregar(t);
            setFormTarea(null);
          }}
        />
      ) : (
        <button className="btn-add" onClick={() => setFormTarea(true)}>
          + Agregar tarea
        </button>
      )}

      <ul className="lista-tareas">
        {pendientes.length === 0 && (
          <p className="muted center" style={{ marginTop: 24 }}>
            No tenés tareas pendientes. ¡Al día!
          </p>
        )}
        {pendientes.map((t) => {
          const mat = materiaById[t.materiaId];
          const atrasada = t.fecha && t.fecha < hoy;
          return (
            <li key={t.id} className={"tarea-card" + (atrasada ? " tarea-atrasada" : "")} style={{ borderLeftColor: mat?.color }}>
              <input type="checkbox" checked={false} onChange={() => onToggle(t.id)} aria-label="Marcar como hecha" />
              <div className="tarea-info">
                <div className="tarea-top">
                  <span className="tarea-sigla" style={{ color: mat?.color }}>{mat?.sigla}</span>
                  <span className="tarea-tipo-badge">{t.tipo}</span>
                  {atrasada && <span className="badge-atrasado">Atrasado</span>}
                </div>
                <p className="tarea-titulo">{t.titulo}</p>
                {t.fecha && <p className="tarea-fecha">{formatearFecha(t.fecha)}</p>}
              </div>
              <button className="mini-x" onClick={() => onBorrar(t.id)} aria-label="Eliminar tarea">×</button>
            </li>
          );
        })}
      </ul>

      {completadas.length > 0 && (
        <div className="completadas-block">
          <button className="link-toggle" onClick={() => setMostrarCompletadas((v) => !v)}>
            {mostrarCompletadas ? "Ocultar" : "Mostrar"} completadas ({completadas.length})
          </button>
          {mostrarCompletadas && (
            <ul className="lista-tareas">
              {completadas.map((t) => {
                const mat = materiaById[t.materiaId];
                return (
                  <li key={t.id} className="tarea-card tarea-hecha" style={{ borderLeftColor: mat?.color }}>
                    <input type="checkbox" checked={true} onChange={() => onToggle(t.id)} aria-label="Marcar como pendiente" />
                    <div className="tarea-info">
                      <div className="tarea-top">
                        <span className="tarea-sigla" style={{ color: mat?.color }}>{mat?.sigla}</span>
                        <span className="tarea-tipo-badge">{t.tipo}</span>
                      </div>
                      <p className="tarea-titulo">{t.titulo}</p>
                    </div>
                    <button className="mini-x" onClick={() => onBorrar(t.id)} aria-label="Eliminar tarea">×</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FormTarea({ materias, filtro, onCancelar, onGuardar }) {
  const [materiaId, setMateriaId] = useState(filtro !== "todas" ? filtro : materias[0]?.id || "");
  const [tipo, setTipo] = useState(TIPOS_TAREA[0]);
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const submit = (e) => {
    e.preventDefault();
    if (!materiaId || !titulo.trim()) return;
    onGuardar({ materiaId, tipo, titulo: titulo.trim(), fecha });
  };

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-row">
        <label>
          Materia
          <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_TAREA.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="label-ancha">
          Título
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej: Práctico 3 - Caché"
            required
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primario">Guardar tarea</button>
      </div>
    </form>
  );
}

function formatearFecha(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ---------- Estilos ---------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Merriweather:wght@700&display=swap');

.app-root {
  --azul: #004987;
  --naranja: #F2AC32;
  --rojo: #E84945;
  --gris-oscuro: #323333;
  --gris-claro: #87898A;
  --borde: #E3E5E6;
  --fondo: #FAFAFA;
  font-family: 'Lato', sans-serif;
  color: var(--gris-oscuro);
  background: var(--fondo);
  min-height: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.topbar {
  position: relative;
  background: var(--azul);
  color: white;
  padding: 22px 20px 26px;
  overflow: hidden;
}
.topbar-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 1.5px);
  background-size: 16px 16px;
  opacity: 0.5;
}
.topbar-inner { position: relative; }
.brand { display: flex; align-items: baseline; gap: 10px; }
.brand-mark {
  font-family: 'Lato', sans-serif;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 2px;
  background: var(--naranja);
  color: var(--gris-oscuro);
  padding: 3px 8px;
  border-radius: 3px;
}
.brand h1 {
  font-family: 'Merriweather', serif;
  font-weight: 700;
  font-size: 26px;
  margin: 0;
}
.brand-sub { margin: 6px 0 0; font-size: 13.5px; color: rgba(255,255,255,0.85); }

.chips {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 16px 20px 0;
}
.chip {
  border: 1.5px solid var(--borde);
  background: white;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
  color: var(--gris-oscuro);
}
.chip:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.chip-active { color: white !important; border-color: transparent !important; }

.tabs {
  display: flex; gap: 4px;
  padding: 18px 20px 0;
  border-bottom: 2px solid var(--borde);
}
.tab {
  background: none; border: none; cursor: pointer;
  font-family: 'Lato', sans-serif;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--gris-claro);
  padding: 10px 6px 12px;
  margin-bottom: -2px;
  border-bottom: 3px solid transparent;
  display: flex; align-items: center; gap: 6px;
}
.tab-active { color: var(--azul); border-bottom-color: var(--naranja); }
.tab-badge {
  background: var(--rojo); color: white; font-size: 11px; font-weight: 900;
  border-radius: 10px; padding: 1px 7px;
}

.content { padding: 20px; }

.muted { color: var(--gris-claro); }
.small { font-size: 12.5px; }
.center { text-align: center; }

/* Calendario */
.grid-semana {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.col-dia { min-width: 0; }
.col-dia-header {
  font-weight: 900;
  font-size: 12.5px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--azul);
  padding-bottom: 8px;
  border-bottom: 2px solid var(--borde);
  margin-bottom: 8px;
  text-align: center;
}
.col-dia-body { display: flex; flex-direction: column; gap: 8px; min-height: 40px; }

.clase-card {
  background: white;
  border: 1px solid var(--borde);
  border-left: 4px solid var(--azul);
  border-radius: 6px;
  padding: 8px 10px;
}
.clase-top { display: flex; justify-content: space-between; align-items: center; }
.clase-hora { font-size: 11.5px; font-weight: 700; color: var(--gris-claro); }
.clase-materia { margin: 4px 0 0; font-weight: 900; font-size: 12.5px; }
.clase-tipo { margin: 2px 0 0; font-size: 12px; color: var(--gris-claro); }

.mini-x {
  background: none; border: none; cursor: pointer;
  color: var(--gris-claro); font-size: 16px; line-height: 1;
  padding: 0 2px;
}
.mini-x:hover { color: var(--rojo); }

.btn-add {
  margin-top: 16px;
  background: white;
  border: 1.5px dashed var(--gris-claro);
  color: var(--azul);
  font-weight: 700;
  font-size: 13.5px;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
}
.btn-add:hover { border-color: var(--azul); background: #F0F5FA; }

.form-card {
  margin-top: 16px;
  background: white;
  border: 1px solid var(--borde);
  border-radius: 8px;
  padding: 16px;
}
.form-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.form-row label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12.5px; font-weight: 700; color: var(--gris-oscuro);
  flex: 1; min-width: 130px;
}
.label-ancha { flex: 1 1 100%; }
.form-row select, .form-row input {
  font-family: 'Lato', sans-serif;
  font-size: 13.5px;
  padding: 7px 8px;
  border: 1.5px solid var(--borde);
  border-radius: 5px;
  color: var(--gris-oscuro);
}
.form-row select:focus, .form-row input:focus {
  outline: 2px solid var(--azul);
  outline-offset: 1px;
}
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn-primario, .btn-secundario {
  font-family: 'Lato', sans-serif;
  font-weight: 700; font-size: 13.5px;
  padding: 8px 16px; border-radius: 6px; cursor: pointer;
}
.btn-primario { background: var(--azul); color: white; border: none; }
.btn-primario:hover { background: #003a6d; }
.btn-secundario { background: none; border: 1.5px solid var(--borde); color: var(--gris-oscuro); }
.btn-secundario:hover { border-color: var(--gris-claro); }

/* Checklist */
.lista-tareas { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tarea-card {
  display: flex; align-items: flex-start; gap: 10px;
  background: white;
  border: 1px solid var(--borde);
  border-left: 4px solid var(--azul);
  border-radius: 6px;
  padding: 10px 12px;
}
.tarea-atrasada { background: #FDF1F0; }
.tarea-hecha { opacity: 0.6; }
.tarea-hecha .tarea-titulo { text-decoration: line-through; }
.tarea-card input[type="checkbox"] { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--azul); cursor: pointer; }
.tarea-info { flex: 1; min-width: 0; }
.tarea-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tarea-sigla { font-weight: 900; font-size: 12px; }
.tarea-tipo-badge {
  font-size: 11px; font-weight: 700; color: var(--gris-claro);
  border: 1px solid var(--borde); border-radius: 10px; padding: 1px 8px;
}
.badge-atrasado {
  font-size: 11px; font-weight: 900; color: white;
  background: var(--rojo); border-radius: 10px; padding: 1px 8px;
}
.tarea-titulo { margin: 4px 0 0; font-size: 14px; font-weight: 700; }
.tarea-fecha { margin: 2px 0 0; font-size: 12px; color: var(--gris-claro); }

.completadas-block { margin-top: 20px; }
.link-toggle {
  background: none; border: none; cursor: pointer;
  color: var(--azul); font-weight: 700; font-size: 13px;
  padding: 0;
}

.toast-error {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: var(--rojo); color: white; font-size: 13px; font-weight: 700;
  padding: 10px 18px; border-radius: 6px;
}

@media (max-width: 640px) {
  .grid-semana { grid-template-columns: 1fr; }
  .col-dia-header { text-align: left; }
}
`;
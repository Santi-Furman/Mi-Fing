import React, { useState, useEffect, useMemo } from "react";
import { db, auth, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";

/* ---------- Datos iniciales ---------- */

const MATERIAS_INICIALES = [
  { id: "arqui", nombre: "Arquitectura de Computadoras", sigla: "ARQUI", color: "#004987" },
  { id: "prog3", nombre: "Programación 3", sigla: "PROG3", color: "#E84945" },
  { id: "eco", nombre: "Economía", sigla: "ECO", color: "#C98A1F" },
];

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const TIPOS_CLASE = ["Teórico", "Práctico", "Laboratorio"];
const TIPOS_TAREA = ["Práctico", "Taller", "Entrega", "Parcial", "Lectura"];

function hoyISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* ---------- Componente principal ---------- */

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [materias, setMaterias] = useState(MATERIAS_INICIALES);
  const [clases, setClases] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [vista, setVista] = useState("calendario");
  const [filtro, setFiltro] = useState("todas");
  const [loading, setLoading] = useState(true);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  const [formClase, setFormClase] = useState(null); // null | {} (nueva) | clase existente
  const [formTarea, setFormTarea] = useState(null);
  const [formMateria, setFormMateria] = useState(null);
  const [saveError, setSaveError] = useState(false);

  /* escuchar el estado de sesión */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setAuthLoading(false);
      if (!u) setLoading(false);
    });
    return () => unsub();
  }, []);

  const iniciarSesion = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Error al iniciar sesión", e);
    }
  };
  const cerrarSesion = () => signOut(auth);

  /* sembrar las materias iniciales una sola vez, si la colección está vacía */
  useEffect(() => {
    if (!usuario) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", usuario.uid, "materias"));
        if (snap.empty) {
          await Promise.all(
            MATERIAS_INICIALES.map((m) =>
              setDoc(doc(db, "users", usuario.uid, "materias", m.id), m)
            )
          );
        }
      } catch (e) {
        console.error("Error sembrando materias iniciales", e);
      }
    })();
  }, [usuario]);

  /* suscripción en tiempo real a las 3 colecciones del usuario logueado */
  useEffect(() => {
    if (!usuario) return;
    setLoading(true);
    const unsubMaterias = onSnapshot(
      collection(db, "users", usuario.uid, "materias"),
      (snap) => {
        setMaterias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setSaveError(false);
      },
      (err) => {
        console.error(err);
        setSaveError(true);
      }
    );
    const unsubClases = onSnapshot(
      collection(db, "users", usuario.uid, "clases"),
      (snap) => {
        setClases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSaveError(false);
      },
      (err) => {
        console.error(err);
        setSaveError(true);
      }
    );
    const unsubTareas = onSnapshot(
      collection(db, "users", usuario.uid, "tareas"),
      (snap) => {
        setTareas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSaveError(false);
      },
      (err) => {
        console.error(err);
        setSaveError(true);
      }
    );
    return () => {
      unsubMaterias();
      unsubClases();
      unsubTareas();
    };
  }, [usuario]);

  /* si la materia filtrada se borró, volver a "todas" */
  useEffect(() => {
    if (filtro !== "todas" && !materias.find((m) => m.id === filtro)) {
      setFiltro("todas");
    }
  }, [materias, filtro]);

  const materiaById = useMemo(() => {
    const m = {};
    materias.forEach((mat) => (m[mat.id] = mat));
    return m;
  }, [materias]);

  const materiasVisibles = useMemo(
    () => (filtro === "todas" ? materias : materias.filter((m) => m.id === filtro)),
    [materias, filtro]
  );

  /* ---------- acciones materias ---------- */
  const agregarMateria = async (m) => {
    try {
      await addDoc(collection(db, "users", usuario.uid, "materias"), m);
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };
  const actualizarMateria = async (m) => {
    try {
      const { id, ...datos } = m;
      await updateDoc(doc(db, "users", usuario.uid, "materias", id), datos);
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };
  const borrarMateria = async (id) => {
    const mat = materiaById[id];
    if (!mat) return;
    const ok = window.confirm(
      `¿Eliminar "${mat.nombre}"? También se van a borrar sus clases y tareas.`
    );
    if (!ok) return;
    try {
      const clasesDeLaMateria = clases.filter((c) => c.materiaId === id);
      const tareasDeLaMateria = tareas.filter((t) => t.materiaId === id);
      await Promise.all([
        deleteDoc(doc(db, "users", usuario.uid, "materias", id)),
        ...clasesDeLaMateria.map((c) => deleteDoc(doc(db, "users", usuario.uid, "clases", c.id))),
        ...tareasDeLaMateria.map((t) => deleteDoc(doc(db, "users", usuario.uid, "tareas", t.id))),
      ]);
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };

  /* ---------- acciones clases ---------- */
  const guardarClase = async (c) => {
    try {
      if (c.id) {
        const { id, ...datos } = c;
        await updateDoc(doc(db, "users", usuario.uid, "clases", id), datos);
      } else {
        await addDoc(collection(db, "users", usuario.uid, "clases"), c);
      }
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };
  const borrarClase = async (id) => {
    try {
      await deleteDoc(doc(db, "users", usuario.uid, "clases", id));
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };

  /* ---------- acciones tareas ---------- */
  const guardarTarea = async (t) => {
    try {
      if (t.id) {
        const { id, ...datos } = t;
        await updateDoc(doc(db, "users", usuario.uid, "tareas", id), datos);
      } else {
        await addDoc(collection(db, "users", usuario.uid, "tareas"), { ...t, hecho: false });
      }
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };
  const borrarTarea = async (id) => {
    try {
      await deleteDoc(doc(db, "users", usuario.uid, "tareas", id));
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };
  const toggleTarea = async (id) => {
    const t = tareas.find((x) => x.id === id);
    if (!t) return;
    try {
      await updateDoc(doc(db, "users", usuario.uid, "tareas", id), { hecho: !t.hecho });
    } catch (e) {
      console.error(e);
      setSaveError(true);
    }
  };

  const clasesFiltradas =
    filtro === "todas" ? clases : clases.filter((c) => c.materiaId === filtro);
  const tareasFiltradas = (
    filtro === "todas" ? tareas : tareas.filter((t) => t.materiaId === filtro)
  ).slice();

  const pendientes = tareasFiltradas
    .filter((t) => !t.hecho)
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const completadas = tareasFiltradas.filter((t) => t.hecho);

  if (authLoading) {
    return (
      <div className="app-root">
        <style>{CSS}</style>
        <p className="muted center" style={{ marginTop: 60 }}>
          Cargando…
        </p>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="app-root">
        <style>{CSS}</style>
        <div className="login-screen">
          <div className="login-card">
            <span className="brand-mark">FING</span>
            <h1 className="login-title">Mi Fing</h1>
            <p className="login-sub">
              Iniciá sesión para ver y editar tu calendario y checklist de materias.
            </p>
            <button className="btn-google" onClick={iniciarSesion}>
              Iniciar sesión con Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="topbar-pattern" aria-hidden="true" />
        <div className="topbar-inner">
          <div className="brand-row">
            <div className="brand">
              <span className="brand-mark">FING</span>
              <h1>Mi Fing</h1>
            </div>
            <div className="user-box">
              {usuario.photoURL && (
                <img className="user-avatar" src={usuario.photoURL} alt="" />
              )}
              <button className="btn-logout" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </div>
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
        <button
          className={"tab" + (vista === "materias" ? " tab-active" : "")}
          onClick={() => setVista("materias")}
        >
          Materias
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
            onEditar={(c) => setFormClase(c)}
            formClase={formClase}
            setFormClase={setFormClase}
            onGuardar={guardarClase}
            filtro={filtro}
          />
        ) : vista === "checklist" ? (
          <ChecklistView
            materias={materiasVisibles}
            materiaById={materiaById}
            pendientes={pendientes}
            completadas={completadas}
            onToggle={toggleTarea}
            onBorrar={borrarTarea}
            onEditar={(t) => setFormTarea(t)}
            mostrarCompletadas={mostrarCompletadas}
            setMostrarCompletadas={setMostrarCompletadas}
            formTarea={formTarea}
            setFormTarea={setFormTarea}
            onGuardar={guardarTarea}
            filtro={filtro}
          />
        ) : (
          <MateriasView
            materias={materias}
            onBorrar={borrarMateria}
            onEditar={(m) => setFormMateria(m)}
            formMateria={formMateria}
            setFormMateria={setFormMateria}
            onAgregar={agregarMateria}
            onActualizar={actualizarMateria}
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

function CalendarioView({ dias, materias, materiaById, clases, onBorrar, onEditar, formClase, setFormClase, onGuardar, filtro }) {
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
                      <span className="acciones-mini">
                        <button className="mini-btn" onClick={() => onEditar(c)} aria-label="Editar clase">✎</button>
                        <button className="mini-x" onClick={() => onBorrar(c.id)} aria-label="Eliminar clase">×</button>
                      </span>
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
          inicial={formClase}
          onCancelar={() => setFormClase(null)}
          onGuardar={(c) => {
            onGuardar(c);
            setFormClase(null);
          }}
        />
      ) : (
        <button className="btn-add" onClick={() => setFormClase({})}>
          + Agregar clase
        </button>
      )}
    </div>
  );
}

function FormClase({ materias, filtro, inicial, onCancelar, onGuardar }) {
  const editando = !!inicial?.id;
  const [materiaId, setMateriaId] = useState(inicial?.materiaId || (filtro !== "todas" ? filtro : materias[0]?.id || ""));
  const [dia, setDia] = useState(inicial?.dia || DIAS[0]);
  const [horaInicio, setHoraInicio] = useState(inicial?.horaInicio || "08:00");
  const [horaFin, setHoraFin] = useState(inicial?.horaFin || "10:00");
  const [tipo, setTipo] = useState(inicial?.tipo || TIPOS_CLASE[0]);
  const [aula, setAula] = useState(inicial?.aula || "");

  const submit = (e) => {
    e.preventDefault();
    if (!materiaId) return;
    onGuardar({ id: inicial?.id, materiaId, dia, horaInicio, horaFin, tipo, aula: aula.trim() });
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
        <button type="submit" className="btn-primario">{editando ? "Guardar cambios" : "Guardar clase"}</button>
      </div>
    </form>
  );
}

/* ---------- Vista Checklist ---------- */

function ChecklistView({
  materias, materiaById, pendientes, completadas, onToggle, onBorrar, onEditar,
  mostrarCompletadas, setMostrarCompletadas, formTarea, setFormTarea, onGuardar, filtro,
}) {
  const hoy = hoyISO();

  return (
    <div>
      {formTarea ? (
        <FormTarea
          materias={materias}
          filtro={filtro}
          inicial={formTarea}
          onCancelar={() => setFormTarea(null)}
          onGuardar={(t) => {
            onGuardar(t);
            setFormTarea(null);
          }}
        />
      ) : (
        <button className="btn-add" onClick={() => setFormTarea({})}>
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
              <span className="acciones-mini">
                <button className="mini-btn" onClick={() => onEditar(t)} aria-label="Editar tarea">✎</button>
                <button className="mini-x" onClick={() => onBorrar(t.id)} aria-label="Eliminar tarea">×</button>
              </span>
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
                    <span className="acciones-mini">
                      <button className="mini-btn" onClick={() => onEditar(t)} aria-label="Editar tarea">✎</button>
                      <button className="mini-x" onClick={() => onBorrar(t.id)} aria-label="Eliminar tarea">×</button>
                    </span>
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

function FormTarea({ materias, filtro, inicial, onCancelar, onGuardar }) {
  const editando = !!inicial?.id;
  const [materiaId, setMateriaId] = useState(inicial?.materiaId || (filtro !== "todas" ? filtro : materias[0]?.id || ""));
  const [tipo, setTipo] = useState(inicial?.tipo || TIPOS_TAREA[0]);
  const [titulo, setTitulo] = useState(inicial?.titulo || "");
  const [fecha, setFecha] = useState(inicial?.fecha || hoyISO());

  const submit = (e) => {
    e.preventDefault();
    if (!materiaId || !titulo.trim()) return;
    onGuardar({ id: inicial?.id, materiaId, tipo, titulo: titulo.trim(), fecha, hecho: inicial?.hecho || false });
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
        <button type="submit" className="btn-primario">{editando ? "Guardar cambios" : "Guardar tarea"}</button>
      </div>
    </form>
  );
}

/* ---------- Vista Materias ---------- */

function MateriasView({ materias, onBorrar, onEditar, formMateria, setFormMateria, onAgregar, onActualizar }) {
  return (
    <div>
      <ul className="lista-materias">
        {materias.map((m) => (
          <li key={m.id} className="materia-card" style={{ borderLeftColor: m.color }}>
            <div className="materia-info">
              <p className="materia-nombre">{m.nombre}</p>
              <p className="materia-sigla-chip" style={{ color: m.color }}>{m.sigla}</p>
            </div>
            <span className="acciones-mini">
              <button className="mini-btn" onClick={() => onEditar(m)} aria-label="Editar materia">✎</button>
              <button className="mini-x" onClick={() => onBorrar(m.id)} aria-label="Eliminar materia">×</button>
            </span>
          </li>
        ))}
      </ul>

      {formMateria ? (
        <FormMateria
          inicial={formMateria}
          onCancelar={() => setFormMateria(null)}
          onGuardar={(m) => {
            if (m.id) onActualizar(m);
            else onAgregar(m);
            setFormMateria(null);
          }}
        />
      ) : (
        <button className="btn-add" onClick={() => setFormMateria({})}>
          + Agregar materia
        </button>
      )}
    </div>
  );
}

function FormMateria({ inicial, onCancelar, onGuardar }) {
  const editando = !!inicial?.id;
  const [nombre, setNombre] = useState(inicial?.nombre || "");
  const [sigla, setSigla] = useState(inicial?.sigla || "");
  const [color, setColor] = useState(inicial?.color || "#004987");

  const submit = (e) => {
    e.preventDefault();
    if (!nombre.trim() || !sigla.trim()) return;
    onGuardar({ id: inicial?.id, nombre: nombre.trim(), sigla: sigla.trim().toUpperCase(), color });
  };

  return (
    <form className="form-card" onSubmit={submit}>
      <div className="form-row">
        <label className="label-ancha">
          Nombre de la materia
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Probabilidad y Estadística" required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Sigla / abreviatura
          <input type="text" value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ej: PYE" maxLength={8} required />
        </label>
        <label>
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="input-color" />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primario">{editando ? "Guardar cambios" : "Guardar materia"}</button>
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

*, *::before, *::after { box-sizing: border-box; }

html, body, #root {
  height: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
  background: #FAFAFA;
}

body {
  min-height: 100dvh;
}

.app-root {
  --azul: #004987;
  --naranja: #F2AC32;
  --rojo: #E84945;
  --gris-oscuro: #323333;
  --gris-claro: #87898A;
  --borde: #E3E5E6;
  --fondo: #FAFAFA;
  color-scheme: light;
  font-family: 'Lato', sans-serif;
  color: var(--gris-oscuro);
  background: var(--fondo);
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding-bottom: 40px;
  display: flex;
  flex-direction: column;
}

.content { flex: 1; }

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
.brand-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.user-box { display: flex; align-items: center; gap: 8px; }
.user-avatar { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); }
.btn-logout {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.4);
  color: white;
  font-family: 'Lato', sans-serif;
  font-weight: 700;
  font-size: 12.5px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-logout:hover { background: rgba(255,255,255,0.22); }

.login-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  background: white;
  border: 1px solid var(--borde);
  border-radius: 12px;
  padding: 36px 28px;
  text-align: center;
  max-width: 340px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.06);
}
.login-title {
  font-family: 'Merriweather', serif;
  font-weight: 700;
  font-size: 24px;
  color: var(--azul);
  margin: 14px 0 6px;
}
.login-sub { color: var(--gris-claro); font-size: 13.5px; margin-bottom: 22px; }
.btn-google {
  background: var(--azul);
  color: white;
  border: none;
  font-family: 'Lato', sans-serif;
  font-weight: 700;
  font-size: 14px;
  padding: 11px 18px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
}
.btn-google:hover { background: #003a6d; }
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
  display: flex; gap: 4px; flex-wrap: wrap;
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

.acciones-mini { display: flex; align-items: center; gap: 4px; }
.mini-btn {
  background: none; border: none; cursor: pointer;
  color: var(--gris-claro); font-size: 13px; line-height: 1;
  padding: 2px 3px;
}
.mini-btn:hover { color: var(--azul); }
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
  padding: 8px 9px;
  border: 1.5px solid var(--borde);
  border-radius: 5px;
  background: white;
  color: var(--gris-oscuro);
}
.form-row select:focus, .form-row input:focus {
  outline: 2px solid var(--azul);
  outline-offset: 1px;
}
.input-color { padding: 3px; height: 36px; cursor: pointer; }
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
.tarea-card input[type="checkbox"] { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--azul); cursor: pointer; flex-shrink: 0; }
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
.tarea-titulo { margin: 4px 0 0; font-size: 14px; font-weight: 700; word-break: break-word; }
.tarea-fecha { margin: 2px 0 0; font-size: 12px; color: var(--gris-claro); }

.completadas-block { margin-top: 20px; }
.link-toggle {
  background: none; border: none; cursor: pointer;
  color: var(--azul); font-weight: 700; font-size: 13px;
  padding: 0;
}

/* Materias */
.lista-materias { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.materia-card {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: white;
  border: 1px solid var(--borde);
  border-left: 4px solid var(--azul);
  border-radius: 6px;
  padding: 12px 14px;
}
.materia-info { min-width: 0; }
.materia-nombre { margin: 0; font-weight: 700; font-size: 14px; word-break: break-word; }
.materia-sigla-chip { margin: 2px 0 0; font-size: 12px; font-weight: 900; }

.toast-error {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: var(--rojo); color: white; font-size: 13px; font-weight: 700;
  padding: 10px 18px; border-radius: 6px;
  max-width: calc(100% - 32px);
  text-align: center;
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .grid-semana { grid-template-columns: 1fr; }
  .col-dia-header { text-align: left; }
}

@media (max-width: 600px) {
  .topbar { padding: 18px 16px 20px; }
  .brand h1 { font-size: 21px; }
  .brand-sub { font-size: 12.5px; }
  .chips { padding: 14px 16px 0; }
  .tabs { padding: 14px 16px 0; }
  .tab { font-size: 13.5px; padding: 8px 4px 10px; }
  .content { padding: 14px; }
  .form-row { flex-direction: column; }
  .form-row label { min-width: 0; }
  .form-actions { flex-direction: column-reverse; }
  .form-actions button { width: 100%; }
}
`;
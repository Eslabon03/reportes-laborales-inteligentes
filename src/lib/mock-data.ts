import { createWorkReport, type WorkReport } from "@/lib/reports";

export const seedReports: WorkReport[] = [
  createWorkReport({
    id: "rep-1001",
    employeeName: "Ana Martinez",
    clientName: "Hotel Mirador",
    site: "Monterrey",
    serviceDate: "2026-03-16",
    summary:
      "Se reviso el cuarto frio. El sensor de temperatura vuelve a descalibrarse y el cliente solicito cotizacion para reemplazo total.",
    tasksPerformed:
      "Limpieza de contactos, calibracion provisional y validacion de alarmas.",
    pendingActions:
      "Enviar cotizacion y programar seguimiento en 48 horas.",
    status: "abierto",
    requiresQuote: true,
    requiresInvoice: false,
    followUpRequired: true,
    failureType: "Sensor o temperatura",
  }),
  createWorkReport({
    id: "rep-1002",
    employeeName: "Luis Ortega",
    clientName: "Clinica San Rafael",
    site: "Saltillo",
    serviceDate: "2026-03-15",
    summary:
      "Mantenimiento preventivo completado. El servicio quedo listo para facturar y solo falta folio interno del cliente.",
    tasksPerformed:
      "Cambio de filtros, limpieza de condensador y pruebas de arranque.",
    pendingActions:
      "Enviar factura y confirmar pago con administracion.",
    status: "en-proceso",
    requiresQuote: false,
    requiresInvoice: true,
    followUpRequired: false,
    failureType: "",
  }),
  createWorkReport({
    id: "rep-1003",
    employeeName: "Karen Solis",
    clientName: "Hotel Mirador",
    site: "Monterrey",
    serviceDate: "2026-03-11",
    summary:
      "Segunda visita por falla intermitente en sensor de temperatura del cuarto frio. El problema vuelve a presentarse en horas pico.",
    tasksPerformed:
      "Revision de cableado y pruebas con equipo temporal.",
    pendingActions:
      "Esperar autorizacion para reemplazo completo.",
    status: "abierto",
    requiresQuote: false,
    requiresInvoice: false,
    followUpRequired: true,
    failureType: "Sensor o temperatura",
  }),
  createWorkReport({
    id: "rep-1004",
    employeeName: "Miguel Pena",
    clientName: "Planta Delta",
    site: "Ramos Arizpe",
    serviceDate: "2026-03-14",
    summary:
      "Se detecto fuga pequena en linea de presion. El cliente pidio propuesta para cambio de tramo y seguimiento al paro programado.",
    tasksPerformed:
      "Ajuste temporal y prueba de estanqueidad.",
    pendingActions:
      "Preparar propuesta economica y agendar visita de correccion.",
    status: "abierto",
    requiresQuote: true,
    requiresInvoice: false,
    followUpRequired: true,
    failureType: "Fuga o filtracion",
  }),
  createWorkReport({
    id: "rep-1005",
    employeeName: "Ana Martinez",
    clientName: "Planta Delta",
    site: "Ramos Arizpe",
    serviceDate: "2026-03-09",
    summary:
      "Nueva alerta por fuga en la misma linea de presion del modulo norte.",
    tasksPerformed:
      "Inspeccion visual y validacion con espuma detectora.",
    pendingActions:
      "Escalar a gerente de mantenimiento del cliente.",
    status: "en-proceso",
    requiresQuote: false,
    requiresInvoice: false,
    followUpRequired: true,
    failureType: "Fuga o filtracion",
  }),
  createWorkReport({
    id: "rep-1006",
    employeeName: "Roberto Diaz",
    clientName: "Restaurante Mar Azul",
    site: "Monterrey",
    serviceDate: "2026-03-13",
    summary:
      "Instalacion finalizada. El cliente solicito factura y confirmacion de arranque despues de la apertura.",
    tasksPerformed:
      "Conexion electrica, arranque inicial y capacitacion al encargado.",
    pendingActions:
      "Emitir factura y llamar al cliente para validar operacion.",
    status: "en-proceso",
    requiresQuote: false,
    requiresInvoice: true,
    followUpRequired: true,
    failureType: "Energia o tablero",
  }),
];
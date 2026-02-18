#!/usr/bin/env node
/**
 * fleet-ui-mcp — Combined MCP server for fleet data tools and UI dashboard plugin.
 *
 * Implements JSON-RPC 2.0 over stdio (no SDK dependencies).
 * Exposes:
 *   vehicle.get, vehicles.list, geofence.check, trip.create,
 *   route.optimize, route.suggest, safety.alerts, safety.score,
 *   ui.listPlugins, ui.getPlugin
 */

const PLUGIN_ID = 'fleet-dashboard';
const PLUGIN_VERSION = '1.0.0';

const PLUGIN_MANIFEST = {
  id: PLUGIN_ID,
  name: 'Fleet Dashboard',
  version: PLUGIN_VERSION,
  description:
    'Real-time fleet map with vehicle tracking, geofences, trip routes, and alerts for the Tel Aviv metropolitan area.',
  render: {
    mode: 'iframe',
    iframeUrl: `/ui/${PLUGIN_ID}/${PLUGIN_VERSION}/index.html`,
  },
  channels: ['command'],
  capabilities: {
    commands: [
      {
        name: 'highlight_vehicle',
        description: 'Select a vehicle on the map and fly to its position.',
        input_schema: {
          type: 'object',
          properties: { vehicle_id: { type: 'string', description: 'Vehicle ID (e.g. VH-003)' } },
          required: ['vehicle_id'],
        },
        idempotent: true,
      },
      {
        name: 'show_route',
        description: 'Display a trip route on the map.',
        input_schema: {
          type: 'object',
          properties: { trip_id: { type: 'string', description: 'Trip ID (e.g. TR-0001)' } },
          required: ['trip_id'],
        },
        idempotent: true,
      },
      {
        name: 'set_vehicle_filter',
        description: 'Filter vehicles shown on the map by status.',
        input_schema: {
          type: 'object',
          properties: { filter: { type: 'string', enum: ['all', 'moving', 'idle', 'alert'], description: 'Vehicle status filter' } },
          required: ['filter'],
        },
        idempotent: true,
      },
      {
        name: 'zoom_to_geofence',
        description: 'Zoom the map to a specific geofence area.',
        input_schema: {
          type: 'object',
          properties: { geofence_id: { type: 'string', description: 'Geofence ID (e.g. GF-001)' } },
          required: ['geofence_id'],
        },
        idempotent: true,
      },
      {
        name: 'show_alert',
        description: 'Highlight a specific alert, zoom to the vehicle involved.',
        input_schema: {
          type: 'object',
          properties: { alert_id: { type: 'string', description: 'Alert ID (e.g. AL-0001)' } },
          required: ['alert_id'],
        },
        idempotent: true,
      },
    ],
  },
};

// Fleet mock data
const VEHICLES = [
  { vehicle_id: 'VH-001', plate: '312-YK', driver: 'Yossi Cohen', type: 'truck', status: 'moving', position: { lng: 34.7918, lat: 32.0853 }, speed: 85, heading: 180, fuel: 72, odometer: 45200 },
  { vehicle_id: 'VH-002', plate: '448-BT', driver: 'David Levy', type: 'van', status: 'idle', position: { lng: 34.7650, lat: 32.0950 }, speed: 0, heading: 90, fuel: 45, odometer: 67800 },
  { vehicle_id: 'VH-003', plate: '485-AB', driver: 'Sarah Mizrahi', type: 'truck', status: 'moving', position: { lng: 34.7890, lat: 32.0700 }, speed: 65, heading: 220, fuel: 88, odometer: 32100 },
  { vehicle_id: 'VH-004', plate: '629-DM', driver: 'Avi Ben-David', type: 'car', status: 'moving', position: { lng: 34.8200, lat: 32.0850 }, speed: 50, heading: 270, fuel: 60, odometer: 89400 },
  { vehicle_id: 'VH-005', plate: '773-RF', driver: 'Rachel Goldstein', type: 'motorcycle', status: 'idle', position: { lng: 34.7800, lat: 32.0853 }, speed: 0, heading: 0, fuel: 90, odometer: 12300 },
  { vehicle_id: 'VH-006', plate: '195-GH', driver: 'Moshe Peretz', type: 'truck', status: 'alert', position: { lng: 34.7680, lat: 32.0880 }, speed: 0, heading: 45, fuel: 12, odometer: 102000 },
  { vehicle_id: 'VH-007', plate: '841-NP', driver: 'Tamar Shapira', type: 'van', status: 'moving', position: { lng: 34.8100, lat: 32.0830 }, speed: 125, heading: 160, fuel: 55, odometer: 54700 },
  { vehicle_id: 'VH-008', plate: '356-WQ', driver: 'Eli Dahan', type: 'car', status: 'idle', position: { lng: 34.7900, lat: 32.0790 }, speed: 0, heading: 300, fuel: 78, odometer: 28900 },
  { vehicle_id: 'VH-009', plate: '502-JL', driver: 'Noa Friedman', type: 'motorcycle', status: 'moving', position: { lng: 34.7850, lat: 32.0900 }, speed: 40, heading: 10, fuel: 65, odometer: 8700 },
  { vehicle_id: 'VH-010', plate: '667-CT', driver: 'Oren Avraham', type: 'truck', status: 'idle', position: { lng: 34.7800, lat: 32.0770 }, speed: 0, heading: 135, fuel: 34, odometer: 78200 },
  { vehicle_id: 'VH-011', plate: '914-EX', driver: 'Michal Katz', type: 'van', status: 'moving', position: { lng: 34.7700, lat: 32.0750 }, speed: 72, heading: 200, fuel: 50, odometer: 41500 },
  { vehicle_id: 'VH-012', plate: '238-SV', driver: 'Amit Rosen', type: 'car', status: 'alert', position: { lng: 34.7950, lat: 32.1000 }, speed: 0, heading: 90, fuel: 8, odometer: 95600 },
  { vehicle_id: 'VH-013', plate: '581-KZ', driver: 'Yael Schwartz', type: 'motorcycle', status: 'moving', position: { lng: 34.8000, lat: 32.1050 }, speed: 55, heading: 350, fuel: 82, odometer: 15800 },
  { vehicle_id: 'VH-014', plate: '726-MR', driver: 'Dan Agmon', type: 'truck', status: 'idle', position: { lng: 34.8050, lat: 32.1080 }, speed: 0, heading: 260, fuel: 42, odometer: 63400 },
  { vehicle_id: 'VH-015', plate: '149-UP', driver: 'Liat Baruch', type: 'van', status: 'moving', position: { lng: 34.7875, lat: 32.0620 }, speed: 90, heading: 180, fuel: 67, odometer: 37200 },
];

const GEOFENCES = [
  { id: 'GF-001', name: 'Tel Aviv Depot', center: [34.7818, 32.0853], radius: 500 },
  { id: 'GF-002', name: 'Herzliya Industrial', center: [34.8050, 32.1080], radius: 800 },
  { id: 'GF-003', name: 'Rishon Restricted', center: [34.7850, 32.0460], radius: 600 },
  { id: 'GF-004', name: 'Ramat Gan Hub', center: [34.8100, 32.0830], radius: 400 },
];

const TRIPS = [
  { trip_id: 'TR-0001', vehicle_id: 'VH-001', driver: 'Yossi Cohen', status: 'in_progress', origin: 'Tel Aviv Port', destination: 'Haifa', distance_km: 95, progress: 45 },
  { trip_id: 'TR-0002', vehicle_id: 'VH-003', driver: 'Sarah Mizrahi', status: 'in_progress', origin: 'Ramat Gan', destination: 'Jerusalem', distance_km: 60, progress: 72 },
  { trip_id: 'TR-0003', vehicle_id: 'VH-004', driver: 'Avi Ben-David', status: 'in_progress', origin: 'Herzliya', destination: 'Ashdod', distance_km: 45, progress: 30 },
  { trip_id: 'TR-0004', vehicle_id: 'VH-007', driver: 'Tamar Shapira', status: 'completed', origin: 'Rishon LeZion', destination: 'Netanya', distance_km: 80, progress: 100 },
  { trip_id: 'TR-0005', vehicle_id: 'VH-011', driver: 'Michal Katz', status: 'completed', origin: 'Petah Tikva', destination: 'Haifa', distance_km: 110, progress: 100 },
  { trip_id: 'TR-0006', vehicle_id: 'VH-005', driver: 'Rachel Goldstein', status: 'scheduled', origin: 'Tel Aviv Port', destination: 'Beer Sheva', distance_km: 120, progress: 0 },
];

let tripCounter = 7;
function now() { return new Date().toISOString(); }

// All tools: 8 fleet data + 2 UI
const TOOLS = {
  'vehicle.get': {
    description: 'Get real-time data for a specific vehicle including position, speed, driver, fuel, and status.',
    inputSchema: {
      type: 'object',
      properties: { vehicle_id: { type: 'string', description: 'Vehicle ID (e.g. VH-003)' } },
      required: ['vehicle_id'],
    },
  },
  'vehicles.list': {
    description: 'List all vehicles in the fleet with optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: moving, idle, alert' },
        type: { type: 'string', description: 'Filter: truck, van, car, motorcycle' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },
  'geofence.check': {
    description: 'Check if vehicles are within their designated geofences. Returns violations.',
    inputSchema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'string', description: 'Check specific vehicle, or omit for all' },
        geofence_id: { type: 'string', description: 'Check specific geofence' },
      },
    },
  },
  'trip.create': {
    description: 'Create a new trip assignment for a vehicle.',
    inputSchema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'string', description: 'Vehicle to assign' },
        origin: { type: 'string', description: 'Trip starting location' },
        destination: { type: 'string', description: 'Trip destination' },
      },
      required: ['vehicle_id', 'origin', 'destination'],
    },
  },
  'route.optimize': {
    description: 'Calculate the optimal route for a vehicle given destination.',
    inputSchema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'string', description: 'Vehicle to route' },
        destination: { type: 'string', description: 'Destination' },
        optimize_for: { type: 'string', description: 'time, distance, or fuel' },
      },
      required: ['vehicle_id', 'destination'],
    },
  },
  'route.suggest': {
    description: 'Suggest route alternatives between two points.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Start point' },
        destination: { type: 'string', description: 'End point' },
      },
      required: ['origin', 'destination'],
    },
  },
  'safety.alerts': {
    description: 'Get recent safety alerts across the fleet.',
    inputSchema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'string', description: 'Filter by vehicle' },
        severity: { type: 'string', description: 'Filter: low, medium, high, critical' },
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  'safety.score': {
    description: 'Calculate a safety score (0-100) for a driver.',
    inputSchema: {
      type: 'object',
      properties: {
        driver_name: { type: 'string', description: 'Driver name' },
        vehicle_id: { type: 'string', description: 'Or filter by vehicle' },
        period_days: { type: 'number', description: 'Scoring period (default: 30)' },
      },
    },
  },
  'ui.listPlugins': {
    description: 'List available UI plugins provided by this connector.',
    inputSchema: { type: 'object', properties: {} },
  },
  'ui.getPlugin': {
    description: 'Get the manifest (render config, capabilities, commands) for a UI plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        plugin_id: { type: 'string', description: 'Plugin ID' },
      },
      required: ['plugin_id'],
    },
  },
};

function handleInitialize() {
  return {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: {
      name: 'fleet-ui-mcp',
      version: PLUGIN_VERSION,
    },
  };
}

function handleToolsList() {
  return {
    tools: Object.entries(TOOLS).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema,
    })),
  };
}

function handleToolCall(name, args) {
  switch (name) {
    // UI tools
    case 'ui.listPlugins':
      return {
        content: [{ type: 'text', text: JSON.stringify([{ id: PLUGIN_ID, name: PLUGIN_MANIFEST.name, version: PLUGIN_VERSION }]) }],
      };

    case 'ui.getPlugin': {
      const pluginId = args?.plugin_id;
      if (pluginId && pluginId !== PLUGIN_ID) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown plugin: ${pluginId}` }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(PLUGIN_MANIFEST) }] };
    }

    // Fleet data tools
    case 'vehicle.get': {
      const v = VEHICLES.find(x => x.vehicle_id === args.vehicle_id);
      if (!v) return { content: [{ type: 'text', text: JSON.stringify({ error: `Vehicle not found: ${args.vehicle_id}` }) }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify({ ...v, last_update: now() }) }] };
    }

    case 'vehicles.list': {
      let list = [...VEHICLES];
      if (args.status) list = list.filter(v => v.status === args.status);
      if (args.type) list = list.filter(v => v.type === args.type);
      list = list.slice(0, args.limit || 50);
      const result = { vehicles: list.map(v => ({ vehicle_id: v.vehicle_id, plate: v.plate, driver: v.driver, type: v.type, status: v.status, speed: v.speed, fuel: v.fuel })), total: list.length };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    case 'geofence.check': {
      const violations = [];
      const vehiclesToCheck = args.vehicle_id ? VEHICLES.filter(v => v.vehicle_id === args.vehicle_id) : VEHICLES;
      const fences = args.geofence_id ? GEOFENCES.filter(g => g.id === args.geofence_id) : GEOFENCES;
      for (const v of vehiclesToCheck) {
        for (const gf of fences) {
          const dist = Math.sqrt(Math.pow((v.position.lng - gf.center[0]) * 111320 * Math.cos(gf.center[1] * Math.PI / 180), 2) + Math.pow((v.position.lat - gf.center[1]) * 110540, 2));
          if (dist > gf.radius * 2) {
            violations.push({ vehicle_id: v.vehicle_id, geofence: gf.name, geofence_id: gf.id, distance_meters: Math.round(dist), since: now() });
          }
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ total_vehicles: vehiclesToCheck.length, in_zone: vehiclesToCheck.length - violations.length, violations }) }] };
    }

    case 'trip.create': {
      const v = VEHICLES.find(x => x.vehicle_id === args.vehicle_id);
      if (!v) return { content: [{ type: 'text', text: JSON.stringify({ error: `Vehicle not found: ${args.vehicle_id}` }) }], isError: true };
      if (v.status === 'alert') return { content: [{ type: 'text', text: JSON.stringify({ error: 'Cannot assign trips to vehicles with active alerts' }) }], isError: true };
      const trip = {
        trip_id: `TR-${String(tripCounter++).padStart(4, '0')}`,
        vehicle_id: args.vehicle_id, driver: v.driver, status: 'scheduled',
        origin: args.origin, destination: args.destination,
        estimated_duration_min: Math.round(30 + Math.random() * 90),
        distance_km: Math.round(20 + Math.random() * 150),
      };
      TRIPS.push(trip);
      return { content: [{ type: 'text', text: JSON.stringify(trip) }] };
    }

    case 'route.optimize': {
      const v = VEHICLES.find(x => x.vehicle_id === args.vehicle_id);
      if (!v) return { content: [{ type: 'text', text: JSON.stringify({ error: `Vehicle not found: ${args.vehicle_id}` }) }], isError: true };
      const distKm = Math.round(30 + Math.random() * 120);
      const result = {
        route_id: `RT-${String(Math.floor(Math.random() * 9000 + 1000))}`,
        vehicle_id: args.vehicle_id,
        origin: { lng: v.position.lng, lat: v.position.lat },
        destination: args.destination,
        optimize_for: args.optimize_for || 'time',
        distance_km: distKm,
        estimated_time_min: Math.round(distKm * 0.8 + Math.random() * 20),
        fuel_estimate_liters: Math.round(distKm * 0.12 * 10) / 10,
        waypoints: [[v.position.lng, v.position.lat], [v.position.lng + 0.05, v.position.lat + 0.1], [v.position.lng + 0.15, v.position.lat + 0.3]],
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    case 'route.suggest': {
      const base = Math.round(30 + Math.random() * 100);
      const routes = [
        { route: 'Highway 2 (Coastal)', distance_km: base, estimated_time_min: Math.round(base * 0.7), fuel_liters: Math.round(base * 0.11 * 10) / 10, traffic: 'moderate' },
        { route: 'Highway 4 (Geha)', distance_km: base + 8, estimated_time_min: Math.round((base + 8) * 0.65), fuel_liters: Math.round((base + 8) * 0.10 * 10) / 10, traffic: 'light' },
        { route: 'Route 40 (Ayalon)', distance_km: base - 5, estimated_time_min: Math.round((base - 5) * 0.9), fuel_liters: Math.round((base - 5) * 0.13 * 10) / 10, traffic: 'heavy' },
      ];
      return { content: [{ type: 'text', text: JSON.stringify(routes) }] };
    }

    case 'safety.alerts': {
      let alerts = [
        { type: 'speeding', severity: 'high', vehicle_id: 'VH-007', driver: 'Tamar Shapira', speed: 125, limit: 90, time: now(), position: { lng: 34.8100, lat: 32.0830 } },
        { type: 'harsh_brake', severity: 'medium', vehicle_id: 'VH-003', driver: 'Sarah Mizrahi', deceleration: -8.5, time: now(), position: { lng: 34.7890, lat: 32.0700 } },
        { type: 'geofence_exit', severity: 'high', vehicle_id: 'VH-012', driver: 'Amit Rosen', geofence: 'Tel Aviv Depot', time: now(), position: { lng: 34.7950, lat: 32.1000 } },
        { type: 'low_fuel', severity: 'low', vehicle_id: 'VH-006', driver: 'Moshe Peretz', fuel_level: 12, time: now(), position: { lng: 34.7680, lat: 32.0880 } },
        { type: 'speeding', severity: 'medium', vehicle_id: 'VH-015', driver: 'Liat Baruch', speed: 105, limit: 90, time: now(), position: { lng: 34.7875, lat: 32.0620 } },
        { type: 'sos', severity: 'critical', vehicle_id: 'VH-006', driver: 'Moshe Peretz', time: now(), message: 'Driver pressed SOS button', position: { lng: 34.7680, lat: 32.0880 } },
      ];
      if (args.vehicle_id) alerts = alerts.filter(a => a.vehicle_id === args.vehicle_id);
      if (args.severity) alerts = alerts.filter(a => a.severity === args.severity);
      return { content: [{ type: 'text', text: JSON.stringify(alerts.slice(0, args.limit || 20)) }] };
    }

    case 'safety.score': {
      let driver = args.driver_name;
      if (!driver && args.vehicle_id) {
        const v = VEHICLES.find(x => x.vehicle_id === args.vehicle_id);
        if (v) driver = v.driver;
      }
      if (!driver) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide driver_name or vehicle_id' }) }], isError: true };
      const score = Math.round(60 + Math.random() * 35);
      const result = {
        driver, score,
        rating: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'needs_improvement',
        period_days: args.period_days || 30,
        events: { speeding: Math.floor(Math.random() * 5), harsh_brake: Math.floor(Math.random() * 4), hard_turn: Math.floor(Math.random() * 3), phone_usage: Math.floor(Math.random() * 2) },
        trend: Math.random() > 0.5 ? 'improving' : 'stable',
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    default:
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
  }
}

/* stdio transport */

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;

  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;

    try {
      const msg = JSON.parse(line);
      const response = dispatch(msg);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      const errResp = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: err.message },
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  }
});

function dispatch(msg) {
  const { id, method, params } = msg;

  if (id === undefined) return null;

  switch (method) {
    case 'initialize':
      return { jsonrpc: '2.0', id, result: handleInitialize() };

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: handleToolsList() };

    case 'tools/call': {
      const result = handleToolCall(params?.name, params?.arguments);
      return { jsonrpc: '2.0', id, result };
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

process.stderr.write('fleet-ui-mcp: ready\n');

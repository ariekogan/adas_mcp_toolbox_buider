#!/usr/bin/env node
/**
 * Deploy Fleet Management — Multi-Agent Solution
 *
 * Architecture:
 *   ┌─────────────────┐
 *   │  Dispatch Hub    │  (gateway — all requests start here)
 *   │  routes & triages│
 *   └───────┬─────────┘
 *           │
 *    ┌──────┼──────────┬──────────────┐
 *    ▼      ▼          ▼              ▼
 * ┌──────┐ ┌────────┐ ┌───────────┐ ┌────────────┐
 * │Fleet │ │Route   │ │Maintenance│ │Compliance  │
 * │Track │ │Planner │ │Scheduler  │ │& Safety    │
 * │      │ │        │ │           │ │            │
 * └──────┘ └────────┘ └───────────┘ └────────────┘
 *  worker    worker      worker        approval
 *
 * 5 skills, 3 connectors, grant economy, handoffs, security contracts
 *
 * Usage:
 *   API_KEY=adas_xxx node deploy-fleet-management.mjs
 */

const BASE = process.env.API_URL || 'http://localhost:3200';
const API_KEY = process.env.API_KEY || '';

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════

const connectors = [
  {
    id: 'fleet-telematics-mcp',
    name: 'Fleet Telematics',
    description: 'Real-time GPS tracking, engine diagnostics, fuel levels, and driver behavior data from vehicle IoT devices.',
    transport: 'stdio',
    command: 'node',
    args: ['/mcp-store/fleet-telematics-mcp/server.js'],
    env: { TELEMATICS_API_URL: 'https://telematics.internal/v2', FLEET_SIZE: '500' },
    category: 'fleet',
    layer: 'domain',
    requiresAuth: true,
    envRequired: ['TELEMATICS_API_URL'],
    envHelp: { TELEMATICS_API_URL: 'Telematics gateway URL for GPS/OBD data ingestion' },
  },
  {
    id: 'routing-engine-mcp',
    name: 'Routing Engine',
    description: 'Route optimization, ETA calculation, geofence management, and traffic-aware path planning.',
    transport: 'stdio',
    command: 'node',
    args: ['/mcp-store/routing-engine-mcp/server.js'],
    env: { MAPS_API_KEY: 'maps-key-placeholder', ROUTING_MODE: 'commercial_vehicle' },
    category: 'logistics',
    layer: 'domain',
    requiresAuth: true,
    envRequired: ['MAPS_API_KEY'],
    envHelp: { MAPS_API_KEY: 'API key for the maps/routing provider (Google, HERE, Mapbox)' },
  },
  {
    id: 'maintenance-db-mcp',
    name: 'Maintenance Database',
    description: 'Vehicle service history, part inventories, work orders, warranty tracking, and preventive maintenance schedules.',
    transport: 'stdio',
    command: 'node',
    args: ['/mcp-store/maintenance-db-mcp/server.js'],
    env: { MAINT_DB_URL: 'postgresql://fleet:secret@db:5432/maintenance' },
    category: 'fleet',
    layer: 'domain',
    requiresAuth: true,
    envRequired: ['MAINT_DB_URL'],
    envHelp: { MAINT_DB_URL: 'PostgreSQL connection string for the maintenance database' },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════════════════════

const skills = [

  // ── Skill 1: Dispatch Hub (gateway) ───────────────────────────────────
  {
    id: 'dispatch-hub',
    name: 'Dispatch Hub',
    description: 'Central dispatch gateway — triages all incoming requests from fleet managers, drivers, and operations staff. Verifies operator identity and routes to the appropriate specialist skill.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['fleet-telematics-mcp'],

    problem: {
      statement: 'Fleet operations teams need a single entry point to manage 500+ vehicles across multiple depots, handling everything from real-time tracking to emergency dispatch.',
      context: 'Regional logistics company with 500 commercial vehicles (trucks, vans, sprinters), 12 depots, 800+ drivers. Operations run 24/7 with peak hours 6am-8pm.',
      goals: [
        'Route all fleet requests to the right specialist in under 5 seconds',
        'Verify operator authorization before granting fleet data access',
        'Handle emergency dispatch requests with priority routing',
      ],
    },

    scenarios: [
      {
        id: 'operator-login',
        title: 'Fleet operator checks in',
        description: 'An operator identifies themselves and states what they need.',
        steps: [
          'Operator says "This is Mike from Depot 3, I need to check on truck FL-247"',
          'Agent verifies operator via fleet.operator.verify tool',
          'Agent determines intent is vehicle tracking',
          'Agent hands off to Fleet Tracker with operator grant',
        ],
        expected_outcome: 'Operator is verified and routed to Fleet Tracker skill.',
      },
      {
        id: 'emergency-dispatch',
        title: 'Emergency vehicle breakdown',
        description: 'A driver reports a breakdown and needs immediate roadside assistance.',
        steps: [
          'Driver calls in: "Truck FL-102 broke down on I-95 mile marker 42"',
          'Agent identifies emergency priority',
          'Agent fetches vehicle location to confirm',
          'Agent hands off to Maintenance Scheduler with emergency flag',
        ],
        expected_outcome: 'Breakdown flagged as emergency and routed to Maintenance with location data.',
      },
    ],

    role: {
      name: 'Fleet Dispatch Coordinator',
      persona: 'You are the central dispatch coordinator for a regional logistics fleet. You are calm, efficient, and decisive. You quickly assess what each caller needs and route them to the right specialist. For emergencies, you act with urgency. You always verify the operator before sharing any fleet data.',
      goals: [
        'Identify and verify the fleet operator or driver',
        'Determine the intent and urgency of the request',
        'Route to the correct specialist skill with appropriate grants',
      ],
      limitations: [
        'Cannot directly modify routes or schedules — must hand off to specialists',
        'Cannot approve maintenance work orders — Compliance must approve high-cost items',
        'Cannot access driver personal information beyond name and role',
      ],
      communication_style: { tone: 'formal', verbosity: 'concise' },
    },

    intents: {
      supported: [
        {
          id: 'track_vehicle',
          description: 'Operator wants to locate or check status of a vehicle',
          examples: ['Where is truck FL-247?', 'Show me the status of van V-019', 'Is truck FL-102 moving?', 'What is the ETA for vehicle FL-330?'],
          maps_to_workflow: 'triage_to_tracking',
          entities: [{ name: 'vehicle_id', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'plan_route',
          description: 'Operator needs route optimization or delivery planning',
          examples: ['Optimize routes for tomorrow morning deliveries', 'Plan a route from Depot 3 to downtown', 'Reroute FL-247 around the highway closure', 'What is the best route for 15 stops?'],
          maps_to_workflow: 'triage_to_routing',
          entities: [{ name: 'depot_id', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'maintenance_request',
          description: 'Driver or operator reports a vehicle issue or schedules maintenance',
          examples: ['Truck FL-102 has engine warning light', 'Schedule oil change for FL-247', 'FL-019 needs brake inspection', 'Breakdown on highway, need tow'],
          maps_to_workflow: 'triage_to_maintenance',
          entities: [
            { name: 'vehicle_id', type: 'string', required: false, extract_from: 'message' },
            { name: 'urgency', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'compliance_check',
          description: 'Operator needs safety compliance info or approval',
          examples: ['Is FL-247 DOT compliant?', 'Check hours-of-service for driver Mike', 'Approve maintenance work order WO-4521', 'Run safety audit on Depot 3 fleet'],
        },
      ],
      thresholds: { accept: 0.80, clarify: 0.50, reject: 0.30 },
      out_of_domain: {
        action: 'reject',
        message: 'I handle fleet operations — vehicle tracking, routing, maintenance, and compliance. For HR or billing questions, please contact the main office.',
        suggest_domains: [],
      },
    },

    tools: [
      {
        id: 'tool-operator-verify',
        id_status: 'permanent',
        name: 'fleet.operator.verify',
        description: 'Verify a fleet operator by name or badge ID. Returns operator profile with role, depot assignment, and authorization level.',
        inputs: [
          { name: 'operator_name', type: 'string', required: false, description: 'Operator full name' },
          { name: 'badge_id', type: 'string', required: false, description: 'Operator badge/employee ID' },
        ],
        output: { type: 'object', description: 'Operator profile with operator_id, name, role, depot, auth_level (L0/L1/L2)' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'operator.verify' },
        policy: { allowed: 'always' },
        mock: {
          enabled: true, mode: 'examples',
          examples: [{
            id: 'verified-operator',
            input: { operator_name: 'Mike Rodriguez' },
            output: { operator_id: 'OP-0342', name: 'Mike Rodriguez', role: 'dispatcher', depot: 'depot-3', auth_level: 'L2', active: true },
            description: 'Verified dispatcher at Depot 3',
          }],
        },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-vehicle-locate',
        id_status: 'permanent',
        name: 'fleet.vehicle.locate',
        description: 'Get real-time GPS position of a vehicle. Quick location check for triage purposes.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID (e.g., FL-247)' },
        ],
        output: { type: 'object', description: 'Vehicle position with lat, lng, speed, heading, last_updated' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'vehicle.locate' },
        policy: { allowed: 'always' },
        mock: {
          enabled: true, mode: 'examples',
          examples: [{
            id: 'vehicle-on-road',
            input: { vehicle_id: 'FL-247' },
            output: { vehicle_id: 'FL-247', lat: 40.7589, lng: -73.9851, speed_mph: 42, heading: 'NE', status: 'in_transit', last_updated: '2026-02-13T14:22:00Z' },
            description: 'Truck in transit on the road',
          }],
        },
        security: { classification: 'internal' },
      },
    ],

    policy: {
      guardrails: {
        never: [
          'Share fleet data with unverified operators',
          'Bypass identity verification for any request',
          'Share driver personal contact info or home addresses',
          'Make promises about delivery times without checking with Route Planner',
        ],
        always: [
          'Verify operator identity before processing any request',
          'Flag emergency/breakdown requests as high priority',
          'Log all dispatch decisions for audit trail',
          'Confirm vehicle ID format before lookups (FL-XXX or V-XXX)',
        ],
      },
      workflows: [
        { id: 'triage_to_tracking', name: 'Triage to Fleet Tracker', trigger: 'track_vehicle', steps: ['fleet.operator.verify', 'fleet.vehicle.locate'], required: true, on_deviation: 'warn' },
        { id: 'triage_to_routing', name: 'Triage to Route Planner', trigger: 'plan_route', steps: ['fleet.operator.verify'], required: true, on_deviation: 'block' },
        { id: 'triage_to_maintenance', name: 'Triage to Maintenance', trigger: 'maintenance_request', steps: ['fleet.operator.verify'], required: true, on_deviation: 'block' },
      ],
      approvals: [],
      escalation: { enabled: true, conditions: ['Operator cannot be verified', 'Multiple simultaneous emergencies'], target: 'compliance-safety' },
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      rv2: { max_iterations: 6, iteration_timeout_ms: 15000, allow_parallel_tools: false, on_max_iterations: 'escalate' },
      hlr: { enabled: true, critic: { enabled: false, strictness: 'medium' }, reflection: { enabled: false, depth: 'shallow' } },
      autonomy: { level: 'supervised' },
    },

    grant_mappings: [
      {
        tool: 'fleet.operator.verify',
        on_success: true,
        grants: [
          { key: 'fleet.operator_id', value_from: '$.operator_id', condition: '$.active == true', ttl_seconds: 7200 },
          { key: 'fleet.auth_level', value_from: '$.auth_level', condition: '$.active == true', ttl_seconds: 7200 },
          { key: 'fleet.depot', value_from: '$.depot', ttl_seconds: 7200 },
        ],
      },
    ],

    access_policy: { rules: [{ tools: ['*'], effect: 'allow' }] },
  },

  // ── Skill 2: Fleet Tracker (worker) ───────────────────────────────────
  {
    id: 'fleet-tracker',
    name: 'Fleet Tracker',
    description: 'Real-time vehicle tracking, telemetry dashboards, geofence alerts, and fleet-wide status overviews.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['fleet-telematics-mcp'],

    problem: {
      statement: 'Fleet managers need instant visibility into vehicle locations, speeds, fuel levels, and driver behavior across hundreds of vehicles.',
      context: 'Operations center monitors 500 vehicles in real time. Geofences trigger alerts for unauthorized stops or route deviations.',
      goals: [
        'Provide sub-minute vehicle location updates',
        'Surface critical alerts (speeding, geofence breach, low fuel) proactively',
        'Enable fleet-wide search and filtering by status, depot, or driver',
      ],
    },

    role: {
      name: 'Fleet Tracking Specialist',
      persona: 'You are a fleet tracking expert. You provide precise, data-driven answers about vehicle locations, speeds, fuel levels, and alerts. You proactively flag anomalies — if a vehicle has been stationary too long, or fuel is critically low, you mention it even if not asked. You think in terms of operational efficiency.',
      goals: ['Provide accurate real-time vehicle positions', 'Surface fleet alerts and anomalies', 'Enable efficient fleet search and filtering'],
      limitations: ['Cannot modify vehicle routes — direct to Route Planner', 'Cannot schedule maintenance — direct to Maintenance Scheduler', 'Read-only access to telematics data'],
      communication_style: { tone: 'technical', verbosity: 'balanced' },
    },

    intents: {
      supported: [
        {
          id: 'locate_vehicle',
          description: 'Track a specific vehicle by ID',
          examples: ['Where is FL-247?', 'Show me truck FL-102 on the map', 'GPS position of V-019'],
          entities: [{ name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' }],
        },
        {
          id: 'fleet_overview',
          description: 'Get a summary of all vehicles or a depot fleet',
          examples: ['Fleet status overview', 'How many trucks are active right now?', 'Show Depot 3 fleet', 'Which vehicles are idle?'],
          entities: [{ name: 'depot_id', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'check_alerts',
          description: 'Review active fleet alerts',
          examples: ['Any active alerts?', 'Show me speeding alerts', 'Geofence breaches today', 'Low fuel warnings'],
          entities: [{ name: 'alert_type', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'vehicle_telemetry',
          description: 'Get detailed vehicle diagnostics and telemetry',
          examples: ['Engine diagnostics for FL-247', 'Fuel level on truck FL-330', 'Mileage report for V-019', 'OBD codes for FL-102'],
          entities: [{ name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' }],
        },
      ],
      thresholds: { accept: 0.82, clarify: 0.55, reject: 0.35 },
      out_of_domain: { action: 'redirect', message: 'I handle vehicle tracking and telemetry. For route changes, try Route Planner. For maintenance, try Maintenance Scheduler.' },
    },

    tools: [
      {
        id: 'tool-vehicle-status',
        id_status: 'permanent',
        name: 'telematics.vehicle.status',
        description: 'Get comprehensive vehicle status — position, speed, fuel, engine health, driver, and current route assignment.',
        inputs: [{ name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' }],
        output: { type: 'object', description: 'Full vehicle status object with position, speed, fuel_pct, engine_status, driver, route_id' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'vehicle.status' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'active-truck', input: { vehicle_id: 'FL-247' }, output: { vehicle_id: 'FL-247', lat: 40.7589, lng: -73.9851, speed_mph: 42, fuel_pct: 68, engine_status: 'normal', driver: 'Carlos Mendez', route_id: 'RT-2026-0213-A', odometer_miles: 87432, last_updated: '2026-02-13T14:22:00Z' }, description: 'Active truck in transit' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-fleet-search',
        id_status: 'permanent',
        name: 'telematics.fleet.search',
        description: 'Search and filter fleet vehicles by status, depot, driver, or alert type. Returns paginated results.',
        inputs: [
          { name: 'status', type: 'string', required: false, description: 'Filter by status: active, idle, parked, maintenance, offline' },
          { name: 'depot', type: 'string', required: false, description: 'Filter by depot ID' },
          { name: 'alert_type', type: 'string', required: false, description: 'Filter by active alert: speeding, geofence, low_fuel, engine_warning' },
          { name: 'limit', type: 'number', required: false, description: 'Max results (default 25)' },
        ],
        output: { type: 'object', description: 'Paginated vehicle list with vehicle_id, status, position, driver, alerts' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'fleet.search' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'active-trucks', input: { status: 'active', depot: 'depot-3' }, output: { vehicles: [{ vehicle_id: 'FL-247', status: 'active', speed_mph: 42, driver: 'Carlos Mendez' }, { vehicle_id: 'FL-251', status: 'active', speed_mph: 55, driver: 'Sarah Kim' }], total: 2, depot: 'depot-3' }, description: 'Active vehicles at Depot 3' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-alerts-list',
        id_status: 'permanent',
        name: 'telematics.alerts.list',
        description: 'List active fleet alerts — speeding, geofence breaches, low fuel, engine warnings, driver behavior.',
        inputs: [
          { name: 'severity', type: 'string', required: false, description: 'Filter: critical, warning, info' },
          { name: 'type', type: 'string', required: false, description: 'Filter: speeding, geofence, low_fuel, engine, driver_behavior' },
          { name: 'vehicle_id', type: 'string', required: false, description: 'Filter by specific vehicle' },
        ],
        output: { type: 'object', description: 'List of active alerts with alert_id, type, severity, vehicle_id, message, timestamp' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'alerts.list' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'active-alerts', input: { severity: 'critical' }, output: { alerts: [{ alert_id: 'ALT-9921', type: 'low_fuel', severity: 'critical', vehicle_id: 'FL-330', message: 'Fuel below 10% — 22 miles from nearest depot', timestamp: '2026-02-13T14:18:00Z' }], total: 1 }, description: 'Critical fuel alert' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-vehicle-diagnostics',
        id_status: 'permanent',
        name: 'telematics.vehicle.diagnostics',
        description: 'Pull OBD-II diagnostic data, engine codes, tire pressure, battery health, and brake wear from vehicle.',
        inputs: [{ name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' }],
        output: { type: 'object', description: 'Diagnostics object with obd_codes, tire_pressure, battery_voltage, brake_wear_pct, coolant_temp' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'vehicle.diagnostics' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'healthy-truck', input: { vehicle_id: 'FL-247' }, output: { vehicle_id: 'FL-247', obd_codes: [], tire_pressure: { fl: 105, fr: 104, rl: 102, rr: 103 }, battery_voltage: 12.6, brake_wear_pct: { front: 72, rear: 65 }, coolant_temp_f: 195, engine_hours: 4821 }, description: 'Healthy vehicle diagnostics' }] },
        security: { classification: 'internal' },
      },
    ],

    policy: {
      guardrails: {
        never: ['Modify vehicle routes or assignments', 'Disable or silence safety alerts', 'Share driver personal phone numbers or addresses', 'Estimate delivery times — defer to Route Planner'],
        always: ['Flag critical alerts immediately even if not asked', 'Include last_updated timestamp in location reports', 'Warn if vehicle data is stale (>5 min old)', 'Suggest maintenance referral for engine warning codes'],
      },
      workflows: [],
      approvals: [],
      escalation: { enabled: true, conditions: ['Vehicle offline for >2 hours unexpectedly', 'Multiple critical alerts on same vehicle'], target: 'dispatch-hub' },
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      rv2: { max_iterations: 8, iteration_timeout_ms: 20000, allow_parallel_tools: true, on_max_iterations: 'fail' },
      hlr: { enabled: true, critic: { enabled: false, strictness: 'low' }, reflection: { enabled: false, depth: 'shallow' } },
      autonomy: { level: 'autonomous' },
    },

    access_policy: {
      rules: [
        { tools: ['telematics.vehicle.status', 'telematics.fleet.search', 'telematics.alerts.list', 'telematics.vehicle.diagnostics'], effect: 'allow', requires_grants: ['fleet.operator_id'] },
      ],
    },
  },

  // ── Skill 3: Route Planner (worker) ───────────────────────────────────
  {
    id: 'route-planner',
    name: 'Route Planner',
    description: 'Intelligent route optimization — plans multi-stop delivery routes, calculates ETAs, handles re-routing for traffic/weather, and manages geofences.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['routing-engine-mcp', 'fleet-telematics-mcp'],

    problem: {
      statement: 'Delivery routes must be optimized daily for 500 vehicles across 12 depots, accounting for traffic, vehicle capacity, driver hours, and delivery windows.',
      context: 'Each vehicle averages 12-18 stops per day. Routes must comply with DOT hours-of-service rules and vehicle weight restrictions.',
      goals: [
        'Reduce total fleet miles by 15% through optimized routing',
        'Provide accurate ETAs within 10-minute windows',
        'Re-route vehicles dynamically when conditions change',
      ],
    },

    role: {
      name: 'Route Optimization Specialist',
      persona: 'You are a logistics routing expert. You think in terms of distance, time windows, vehicle capacity, and driver hours. You always consider constraints: weight limits, DOT hours, customer delivery windows. When suggesting routes, you explain the trade-offs (fastest vs. shortest vs. most fuel-efficient).',
      goals: ['Optimize multi-stop delivery routes', 'Provide accurate time-window-aware ETAs', 'Handle dynamic re-routing for traffic and weather'],
      limitations: ['Cannot dispatch drivers or reassign vehicles — Dispatch Hub handles that', 'Cannot approve overtime — Compliance must approve', 'Cannot modify customer delivery windows'],
      communication_style: { tone: 'technical', verbosity: 'detailed' },
    },

    intents: {
      supported: [
        {
          id: 'optimize_route',
          description: 'Optimize a delivery route for a vehicle or depot',
          examples: ['Optimize tomorrow\'s route for FL-247', 'Plan routes for Depot 3 morning shift', 'Best route for 15 downtown stops'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: false, extract_from: 'message' },
            { name: 'depot_id', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'calculate_eta',
          description: 'Get ETA for a vehicle to a destination',
          examples: ['ETA for FL-247 to 123 Main St?', 'When will FL-330 arrive at Depot 5?', 'How long to reach customer from current position?'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' },
            { name: 'destination', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'reroute_vehicle',
          description: 'Change a vehicle route due to traffic, weather, or priority change',
          examples: ['Reroute FL-247 around I-95 closure', 'Add priority stop for FL-102', 'Skip remaining stops, return to depot'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' },
            { name: 'reason', type: 'string', required: false, extract_from: 'message' },
          ],
        },
      ],
      thresholds: { accept: 0.80, clarify: 0.55, reject: 0.35 },
      out_of_domain: { action: 'redirect', message: 'I handle route planning and optimization. For vehicle tracking, try Fleet Tracker. For maintenance, try Maintenance Scheduler.' },
    },

    tools: [
      {
        id: 'tool-route-optimize',
        id_status: 'permanent',
        name: 'routing.route.optimize',
        description: 'Generate optimized multi-stop route considering traffic, time windows, vehicle capacity, and driver hours.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle to plan route for' },
          { name: 'stops', type: 'array', required: false, description: 'Array of stop addresses/coordinates (if empty, uses assigned deliveries)' },
          { name: 'constraints', type: 'object', required: false, description: 'Constraints: max_hours, avoid_highways, priority_stops' },
        ],
        output: { type: 'object', description: 'Optimized route with ordered stops, total_miles, total_time, fuel_estimate' },
        source: { type: 'mcp_bridge', connection_id: 'routing-engine-mcp', mcp_tool: 'route.optimize' },
        policy: { allowed: 'conditional', conditions: [{ when: 'stops > 30', action: 'require_approval', message: 'Routes with 30+ stops need dispatcher review' }] },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'optimized-route', input: { vehicle_id: 'FL-247' }, output: { route_id: 'RT-2026-0214-A', vehicle_id: 'FL-247', stops: [{ seq: 1, address: '100 Commerce Blvd', eta: '06:30', window: '06:00-07:00' }, { seq: 2, address: '250 Market St', eta: '07:15', window: '07:00-08:00' }, { seq: 3, address: '89 Oak Ave', eta: '08:00', window: '07:30-09:00' }], total_miles: 47.3, total_time_min: 185, fuel_estimate_gal: 8.2, driver_hours: 3.1 }, description: 'Optimized 3-stop route' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-eta-calculate',
        id_status: 'permanent',
        name: 'routing.eta.calculate',
        description: 'Calculate ETA from vehicle current position to a destination, accounting for real-time traffic.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' },
          { name: 'destination', type: 'string', required: true, description: 'Destination address or coordinates' },
        ],
        output: { type: 'object', description: 'ETA object with arrival_time, distance_miles, travel_time_min, traffic_delay_min' },
        source: { type: 'mcp_bridge', connection_id: 'routing-engine-mcp', mcp_tool: 'eta.calculate' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'eta-result', input: { vehicle_id: 'FL-247', destination: '250 Market St, Springfield' }, output: { vehicle_id: 'FL-247', destination: '250 Market St, Springfield', arrival_time: '2026-02-13T15:45:00Z', distance_miles: 12.4, travel_time_min: 28, traffic_delay_min: 5, confidence: 0.92 }, description: 'ETA with traffic' }] },
        security: { classification: 'public' },
      },
      {
        id: 'tool-route-reroute',
        id_status: 'permanent',
        name: 'routing.route.reroute',
        description: 'Reroute a vehicle — add/remove/reorder stops, avoid areas, or return to depot.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' },
          { name: 'action', type: 'string', required: true, description: 'Action: add_stop, remove_stop, avoid_area, return_to_depot, reoptimize' },
          { name: 'params', type: 'object', required: false, description: 'Action-specific parameters' },
        ],
        output: { type: 'object', description: 'Updated route with new stops, revised ETAs, and change summary' },
        source: { type: 'mcp_bridge', connection_id: 'routing-engine-mcp', mcp_tool: 'route.reroute' },
        policy: { allowed: 'conditional', conditions: [{ when: 'action == "return_to_depot"', action: 'require_approval', message: 'Returning to depot cancels remaining deliveries — dispatcher approval needed' }] },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'reroute-avoid', input: { vehicle_id: 'FL-247', action: 'avoid_area', params: { area: 'I-95 between exits 12-15' } }, output: { route_id: 'RT-2026-0213-A-v2', vehicle_id: 'FL-247', change: 'Rerouted via US-1, adding 4.2 miles and 12 min', new_total_miles: 51.5, revised_eta: '2026-02-13T16:00:00Z' }, description: 'Reroute to avoid highway section' }] },
        security: { classification: 'internal' },
      },
    ],

    policy: {
      guardrails: {
        never: ['Create routes that exceed DOT hours-of-service limits', 'Route through residential zones with heavy commercial vehicles', 'Ignore customer delivery time windows', 'Override dispatcher route assignments without approval'],
        always: ['Include fuel estimates in route plans', 'Warn when a route approaches driver hour limits', 'Show trade-offs between route options', 'Verify vehicle weight class matches road restrictions'],
      },
      workflows: [
        { id: 'route_optimization_flow', name: 'Route Optimization', trigger: 'optimize_route', steps: ['routing.route.optimize'], required: true, on_deviation: 'warn' },
      ],
      approvals: [
        { id: 'high-stop-approval', tool_id: 'tool-route-optimize', conditions: [{ when: 'stops > 30', action: 'require_approval' }], approver: 'dispatch-hub' },
      ],
      escalation: { enabled: true, conditions: ['No feasible route within constraints', 'Driver hours exceeded'], target: 'compliance-safety' },
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      rv2: { max_iterations: 10, iteration_timeout_ms: 30000, allow_parallel_tools: true, on_max_iterations: 'fail' },
      hlr: { enabled: true, critic: { enabled: true, check_interval: 3, strictness: 'medium' }, reflection: { enabled: false, depth: 'medium' }, replanning: { enabled: true, max_replans: 2 } },
      autonomy: { level: 'autonomous' },
    },

    access_policy: {
      rules: [
        { tools: ['routing.route.optimize', 'routing.route.reroute'], effect: 'allow', requires_grants: ['fleet.operator_id', 'fleet.auth_level'], inject: { depot: '$.fleet.depot' } },
        { tools: ['routing.eta.calculate'], effect: 'allow', requires_grants: ['fleet.operator_id'] },
      ],
    },
  },

  // ── Skill 4: Maintenance Scheduler (worker) ──────────────────────────
  {
    id: 'maintenance-scheduler',
    name: 'Maintenance Scheduler',
    description: 'Vehicle maintenance lifecycle — creates work orders, schedules service appointments, tracks part inventories, manages preventive maintenance programs, and handles emergency breakdown response.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['maintenance-db-mcp', 'fleet-telematics-mcp'],

    problem: {
      statement: 'A 500-vehicle fleet requires systematic maintenance scheduling — preventive maintenance every 10K miles, annual inspections, and rapid breakdown response — while minimizing vehicle downtime.',
      context: 'Average vehicle downtime costs $800/day in lost revenue. Parts warehouse stocks 2000+ SKUs. 3 in-house service bays per depot plus contracts with 15 external repair shops.',
      goals: [
        'Keep unplanned downtime below 3% of fleet hours',
        'Schedule preventive maintenance within 500 miles of due date',
        'Respond to breakdowns within 30 minutes with tow/roadside dispatch',
      ],
    },

    role: {
      name: 'Fleet Maintenance Coordinator',
      persona: 'You are an experienced fleet maintenance coordinator. You balance urgency with efficiency — breakdowns get immediate attention, but you also proactively schedule preventive maintenance to avoid future breakdowns. You track parts availability and can estimate repair timelines. You speak with authority about vehicle health and maintenance priorities.',
      goals: ['Create and manage work orders efficiently', 'Schedule preventive maintenance proactively', 'Coordinate emergency breakdown response'],
      limitations: ['Cannot approve work orders over $5,000 — Compliance must approve', 'Cannot order parts over $2,000 without approval', 'Cannot take vehicles out of service without dispatcher coordination'],
      communication_style: { tone: 'technical', verbosity: 'balanced' },
    },

    intents: {
      supported: [
        {
          id: 'create_work_order',
          description: 'Create a maintenance work order for a vehicle',
          examples: ['Create work order for FL-247 oil change', 'Schedule brake replacement for FL-102', 'FL-330 needs tire rotation'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' },
            { name: 'service_type', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'check_maintenance_schedule',
          description: 'Review upcoming scheduled maintenance',
          examples: ['What maintenance is due this week?', 'FL-247 service history', 'Overdue maintenance report', 'When is FL-102 due for inspection?'],
          entities: [{ name: 'vehicle_id', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'emergency_breakdown',
          description: 'Handle a vehicle breakdown emergency',
          examples: ['FL-102 broke down on I-95', 'Emergency: truck disabled at mile marker 42', 'Need roadside assistance for FL-330'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: true, extract_from: 'message' },
            { name: 'location', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'check_parts',
          description: 'Check parts availability for a repair',
          examples: ['Do we have brake pads for FL-247?', 'Oil filter inventory for class 6 trucks', 'Part availability for alternator replacement'],
          entities: [{ name: 'part_name', type: 'string', required: true, extract_from: 'message' }],
        },
      ],
      thresholds: { accept: 0.80, clarify: 0.55, reject: 0.30 },
      out_of_domain: { action: 'redirect', message: 'I handle vehicle maintenance and repairs. For tracking, try Fleet Tracker. For route changes, try Route Planner.' },
    },

    tools: [
      {
        id: 'tool-wo-create',
        id_status: 'permanent',
        name: 'maintenance.workorder.create',
        description: 'Create a new maintenance work order for a vehicle with service type, priority, and estimated cost.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' },
          { name: 'service_type', type: 'string', required: true, description: 'Service: oil_change, brakes, tires, engine, transmission, inspection, electrical, body, emergency' },
          { name: 'priority', type: 'string', required: false, description: 'Priority: emergency, high, normal, low (default: normal)' },
          { name: 'description', type: 'string', required: false, description: 'Detailed description of the issue or service needed' },
          { name: 'estimated_cost', type: 'number', required: false, description: 'Estimated repair cost in USD' },
        ],
        output: { type: 'object', description: 'Created work order with wo_id, status, scheduled_date, assigned_bay' },
        source: { type: 'mcp_bridge', connection_id: 'maintenance-db-mcp', mcp_tool: 'workorder.create' },
        policy: {
          allowed: 'conditional',
          conditions: [
            { when: 'estimated_cost > 5000', action: 'require_approval', message: 'Work orders over $5,000 require Compliance approval' },
            { when: 'priority == "emergency"', action: 'allow', message: 'Emergency work orders are auto-approved' },
          ],
        },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'oil-change-wo', input: { vehicle_id: 'FL-247', service_type: 'oil_change', priority: 'normal' }, output: { wo_id: 'WO-4523', vehicle_id: 'FL-247', service_type: 'oil_change', priority: 'normal', status: 'scheduled', scheduled_date: '2026-02-15', assigned_bay: 'depot-3-bay-2', estimated_cost: 250, estimated_hours: 1.5 }, description: 'Scheduled oil change work order' }] },
        security: { classification: 'financial', risk: 'medium' },
      },
      {
        id: 'tool-schedule-list',
        id_status: 'permanent',
        name: 'maintenance.schedule.list',
        description: 'List upcoming scheduled maintenance, overdue items, and recent service history.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: false, description: 'Filter by vehicle ID' },
          { name: 'depot_id', type: 'string', required: false, description: 'Filter by depot' },
          { name: 'status', type: 'string', required: false, description: 'Filter: due, overdue, completed, in_progress' },
          { name: 'days_ahead', type: 'number', required: false, description: 'Look-ahead window in days (default: 7)' },
        ],
        output: { type: 'object', description: 'List of maintenance items with vehicle_id, service_type, due_date, status, mileage_due' },
        source: { type: 'mcp_bridge', connection_id: 'maintenance-db-mcp', mcp_tool: 'schedule.list' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'upcoming-maintenance', input: { depot_id: 'depot-3', days_ahead: 7 }, output: { items: [{ vehicle_id: 'FL-247', service_type: 'oil_change', due_date: '2026-02-15', status: 'due', current_miles: 87432, due_miles: 87500 }, { vehicle_id: 'FL-330', service_type: 'inspection', due_date: '2026-02-17', status: 'due' }], total: 2, depot: 'depot-3' }, description: 'Upcoming maintenance at Depot 3' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-parts-check',
        id_status: 'permanent',
        name: 'maintenance.parts.check',
        description: 'Check parts inventory and availability for a specific repair.',
        inputs: [
          { name: 'part_name', type: 'string', required: true, description: 'Part name or number' },
          { name: 'vehicle_class', type: 'string', required: false, description: 'Vehicle class for compatibility check' },
          { name: 'depot_id', type: 'string', required: false, description: 'Check stock at specific depot' },
        ],
        output: { type: 'object', description: 'Part availability with in_stock, quantity, location, price, compatible_vehicles' },
        source: { type: 'mcp_bridge', connection_id: 'maintenance-db-mcp', mcp_tool: 'parts.check' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'brake-pads', input: { part_name: 'brake pads', vehicle_class: 'class-6' }, output: { part_number: 'BP-4412-C6', part_name: 'Brake Pad Set — Class 6', in_stock: true, quantity: 24, location: 'depot-3-warehouse', unit_price: 189.99, compatible_vehicles: ['FL-100 to FL-350'] }, description: 'Brake pads in stock' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-emergency-dispatch',
        id_status: 'permanent',
        name: 'maintenance.emergency.dispatch',
        description: 'Dispatch emergency roadside assistance or tow truck to a broken-down vehicle.',
        inputs: [
          { name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' },
          { name: 'location', type: 'string', required: true, description: 'Breakdown location (address or coordinates)' },
          { name: 'issue', type: 'string', required: false, description: 'Description of the breakdown issue' },
        ],
        output: { type: 'object', description: 'Emergency dispatch confirmation with dispatch_id, tow_eta, assigned_shop' },
        source: { type: 'mcp_bridge', connection_id: 'maintenance-db-mcp', mcp_tool: 'emergency.dispatch' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'breakdown-dispatch', input: { vehicle_id: 'FL-102', location: 'I-95 mile marker 42', issue: 'Engine overheating, unable to drive' }, output: { dispatch_id: 'EMG-2026-0892', vehicle_id: 'FL-102', tow_eta_min: 25, assigned_shop: 'Metro Truck Repair — Springfield', status: 'dispatched', priority: 'emergency' }, description: 'Emergency tow dispatched' }] },
        security: { classification: 'internal', risk: 'medium' },
      },
    ],

    policy: {
      guardrails: {
        never: ['Approve work orders over $5,000 without Compliance review', 'Skip safety-critical maintenance items', 'Delay emergency breakdown response for scheduling reasons', 'Order parts without checking inventory first'],
        always: ['Check parts availability before scheduling repair work', 'Flag overdue safety inspections as high priority', 'Include cost estimates in all work orders', 'Notify dispatcher when taking a vehicle out of service'],
      },
      workflows: [
        { id: 'create_wo_flow', name: 'Create Work Order', trigger: 'create_work_order', steps: ['maintenance.parts.check', 'maintenance.workorder.create'], required: true, on_deviation: 'warn' },
        { id: 'emergency_flow', name: 'Emergency Breakdown', trigger: 'emergency_breakdown', steps: ['maintenance.emergency.dispatch', 'maintenance.workorder.create'], required: true, on_deviation: 'block' },
      ],
      approvals: [
        { id: 'high-cost-wo', tool_id: 'tool-wo-create', conditions: [{ when: 'estimated_cost > 5000', action: 'require_approval' }], approver: 'compliance-safety' },
      ],
      escalation: { enabled: true, conditions: ['Work order cost exceeds $5,000', 'Safety-critical repair needed on multiple vehicles'], target: 'compliance-safety' },
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      rv2: { max_iterations: 10, iteration_timeout_ms: 25000, allow_parallel_tools: true, on_max_iterations: 'escalate' },
      hlr: { enabled: true, critic: { enabled: true, check_interval: 3, strictness: 'high' }, reflection: { enabled: true, depth: 'medium' }, replanning: { enabled: true, max_replans: 2 } },
      autonomy: { level: 'supervised' },
    },

    access_policy: {
      rules: [
        { tools: ['maintenance.workorder.create', 'maintenance.emergency.dispatch'], effect: 'allow', requires_grants: ['fleet.operator_id', 'fleet.auth_level'] },
        { tools: ['maintenance.schedule.list', 'maintenance.parts.check'], effect: 'allow', requires_grants: ['fleet.operator_id'] },
      ],
    },
  },

  // ── Skill 5: Compliance & Safety (approval) ──────────────────────────
  {
    id: 'compliance-safety',
    name: 'Compliance & Safety',
    description: 'Regulatory compliance enforcement — DOT hours-of-service tracking, vehicle inspection compliance, safety audit automation, and high-cost work order approvals.',
    version: '1.0.0',
    phase: 'TOOL_DEFINITION',
    connectors: ['fleet-telematics-mcp', 'maintenance-db-mcp'],

    problem: {
      statement: 'Fleet must maintain 100% DOT compliance for hours-of-service, annual inspections, and vehicle safety standards — violations carry fines up to $16,000 per incident.',
      context: 'FMCSA regulations require electronic logging (ELD), annual inspections, pre/post-trip inspections, and driver qualification files. Fleet CSA score directly impacts insurance rates.',
      goals: [
        'Maintain 100% hours-of-service compliance across all drivers',
        'Zero overdue annual inspections',
        'Approve/reject high-cost work orders within 2 hours',
      ],
    },

    role: {
      name: 'Fleet Compliance Officer',
      persona: 'You are the fleet compliance authority. You enforce regulations strictly but fairly. You understand DOT/FMCSA rules deeply and can quickly assess whether a vehicle or driver is compliant. For work order approvals, you weigh safety vs. cost — safety always wins. You flag risks proactively and never let a non-compliant vehicle operate.',
      goals: ['Enforce DOT compliance across the fleet', 'Approve or reject high-cost maintenance work orders', 'Conduct safety audits and flag risks'],
      limitations: ['Cannot override DOT regulations for any reason', 'Cannot approve spending beyond $50,000 without executive review', 'Cannot modify driver qualification records'],
      communication_style: { tone: 'formal', verbosity: 'detailed' },
    },

    intents: {
      supported: [
        {
          id: 'compliance_check',
          description: 'Check compliance status for a vehicle or driver',
          examples: ['Is FL-247 DOT compliant?', 'Hours-of-service status for driver Mike', 'Inspection status for Depot 3 fleet', 'CSA score check'],
          entities: [
            { name: 'vehicle_id', type: 'string', required: false, extract_from: 'message' },
            { name: 'driver_name', type: 'string', required: false, extract_from: 'message' },
          ],
        },
        {
          id: 'approve_work_order',
          description: 'Review and approve/reject a high-cost work order',
          examples: ['Approve WO-4523', 'Review pending work orders', 'Reject work order for FL-330 — overpriced'],
          entities: [{ name: 'wo_id', type: 'string', required: false, extract_from: 'message' }],
        },
        {
          id: 'safety_audit',
          description: 'Run or review a safety audit for a depot or fleet segment',
          examples: ['Run safety audit for Depot 3', 'Fleet-wide compliance report', 'Which vehicles are out of compliance?'],
          entities: [{ name: 'depot_id', type: 'string', required: false, extract_from: 'message' }],
        },
      ],
      thresholds: { accept: 0.82, clarify: 0.55, reject: 0.35 },
      out_of_domain: { action: 'redirect', message: 'I handle compliance, safety, and work order approvals. For vehicle tracking, try Fleet Tracker.' },
    },

    tools: [
      {
        id: 'tool-compliance-check',
        id_status: 'permanent',
        name: 'compliance.vehicle.check',
        description: 'Check DOT compliance status for a vehicle — inspection dates, ELD status, safety violations, weight compliance.',
        inputs: [{ name: 'vehicle_id', type: 'string', required: true, description: 'Vehicle fleet ID' }],
        output: { type: 'object', description: 'Compliance report with inspection_status, eld_compliant, violations, next_inspection_due' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'compliance.check' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'compliant-vehicle', input: { vehicle_id: 'FL-247' }, output: { vehicle_id: 'FL-247', dot_compliant: true, last_inspection: '2025-11-15', next_inspection_due: '2026-11-15', eld_compliant: true, active_violations: 0, csa_points: 2, weight_compliant: true }, description: 'Fully compliant vehicle' }] },
        security: { classification: 'internal' },
      },
      {
        id: 'tool-hos-check',
        id_status: 'permanent',
        name: 'compliance.driver.hos',
        description: 'Check driver hours-of-service status — remaining drive time, duty time, required breaks, and 34-hour restart eligibility.',
        inputs: [
          { name: 'driver_id', type: 'string', required: false, description: 'Driver ID' },
          { name: 'driver_name', type: 'string', required: false, description: 'Driver name (if ID unknown)' },
        ],
        output: { type: 'object', description: 'HOS status with remaining_drive_hours, remaining_duty_hours, break_required, restart_available' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'driver.hos' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'driver-hos', input: { driver_name: 'Mike Rodriguez' }, output: { driver_id: 'DRV-0342', driver_name: 'Mike Rodriguez', remaining_drive_hours: 6.5, remaining_duty_hours: 8.0, consecutive_off_duty_hours: 2, break_required_in_hours: 3.5, restart_34hr_available: false, status: 'on_duty_driving', last_updated: '2026-02-13T14:30:00Z' }, description: 'Driver with 6.5 hours remaining' }] },
        security: { classification: 'pii_read' },
      },
      {
        id: 'tool-wo-approve',
        id_status: 'permanent',
        name: 'compliance.workorder.review',
        description: 'Review, approve, or reject a maintenance work order. Returns the work order details for review and allows setting approval status.',
        inputs: [
          { name: 'wo_id', type: 'string', required: true, description: 'Work order ID' },
          { name: 'action', type: 'string', required: true, description: 'Action: review, approve, reject' },
          { name: 'notes', type: 'string', required: false, description: 'Approval/rejection notes' },
        ],
        output: { type: 'object', description: 'Work order details with approval status' },
        source: { type: 'mcp_bridge', connection_id: 'maintenance-db-mcp', mcp_tool: 'workorder.review' },
        policy: {
          allowed: 'conditional',
          conditions: [
            { when: 'estimated_cost > 50000', action: 'deny', message: 'Work orders over $50,000 require executive approval — escalating.' },
          ],
        },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'approve-wo', input: { wo_id: 'WO-4523', action: 'approve', notes: 'Safety-critical — approved for immediate scheduling' }, output: { wo_id: 'WO-4523', vehicle_id: 'FL-247', service_type: 'brakes', estimated_cost: 1200, status: 'approved', approved_by: 'compliance-safety', approved_at: '2026-02-13T15:00:00Z' }, description: 'Work order approved' }] },
        security: { classification: 'financial', risk: 'high' },
      },
      {
        id: 'tool-safety-audit',
        id_status: 'permanent',
        name: 'compliance.audit.run',
        description: 'Run a compliance audit for a depot — checks all vehicles for inspection status, ELD compliance, overdue maintenance, and driver HOS violations.',
        inputs: [
          { name: 'depot_id', type: 'string', required: false, description: 'Depot to audit (if empty, runs fleet-wide)' },
          { name: 'scope', type: 'string', required: false, description: 'Audit scope: full, inspections, eld, hos, maintenance' },
        ],
        output: { type: 'object', description: 'Audit report with total_vehicles, compliant, non_compliant, issues list' },
        source: { type: 'mcp_bridge', connection_id: 'fleet-telematics-mcp', mcp_tool: 'audit.run' },
        policy: { allowed: 'always' },
        mock: { enabled: true, mode: 'examples', examples: [{ id: 'depot-audit', input: { depot_id: 'depot-3', scope: 'full' }, output: { depot: 'depot-3', total_vehicles: 42, compliant: 39, non_compliant: 3, issues: [{ vehicle_id: 'FL-305', issue: 'Annual inspection overdue by 12 days', severity: 'critical' }, { vehicle_id: 'FL-312', issue: 'ELD calibration due', severity: 'warning' }, { vehicle_id: 'FL-298', issue: 'Brake inspection overdue', severity: 'critical' }], overall_compliance_pct: 92.9, csa_score: 4.2 }, description: 'Depot 3 audit with 3 issues' }] },
        security: { classification: 'internal' },
      },
    ],

    policy: {
      guardrails: {
        never: ['Approve a non-compliant vehicle for road service', 'Override DOT hours-of-service limits', 'Approve work orders over $50,000 without executive escalation', 'Dismiss safety violations without remediation plan'],
        always: ['Flag vehicles with overdue inspections as non-operational', 'Require remediation timeline for all compliance issues', 'Document approval reasoning for audit trail', 'Notify dispatch when a vehicle is taken out of compliance'],
      },
      workflows: [
        { id: 'wo_approval_flow', name: 'Work Order Approval', trigger: 'approve_work_order', steps: ['compliance.workorder.review'], required: true, on_deviation: 'block' },
        { id: 'safety_audit_flow', name: 'Safety Audit', trigger: 'safety_audit', steps: ['compliance.audit.run'], required: true, on_deviation: 'warn' },
      ],
      approvals: [],
      escalation: { enabled: true, conditions: ['Work order exceeds $50,000', 'Fleet-wide compliance below 90%'], target: 'dispatch-hub' },
    },

    engine: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.1,
      rv2: { max_iterations: 8, iteration_timeout_ms: 20000, allow_parallel_tools: true, on_max_iterations: 'fail' },
      hlr: { enabled: true, critic: { enabled: true, check_interval: 2, strictness: 'high' }, reflection: { enabled: true, depth: 'deep' }, replanning: { enabled: true, max_replans: 1 } },
      autonomy: { level: 'restricted' },
    },

    access_policy: {
      rules: [
        { tools: ['compliance.workorder.review'], effect: 'allow', requires_grants: ['fleet.operator_id', 'fleet.auth_level'], inject: { reviewer: '$.fleet.operator_id' } },
        { tools: ['compliance.vehicle.check', 'compliance.driver.hos', 'compliance.audit.run'], effect: 'allow', requires_grants: ['fleet.operator_id'] },
      ],
    },

    grant_mappings: [
      {
        tool: 'compliance.workorder.review',
        on_success: true,
        grants: [
          { key: 'fleet.wo_approved', value_from: '$.wo_id', condition: '$.status == "approved"', ttl_seconds: 86400 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SOLUTION
// ═══════════════════════════════════════════════════════════════════════════

const solution = {
  id: 'fleet-management',
  name: 'Fleet Management Operations',
  version: '1.0.0',
  description: 'Multi-agent fleet management system for a 500-vehicle logistics operation. Handles real-time tracking, route optimization, maintenance scheduling, and DOT compliance across 12 depots.',

  identity: {
    actor_types: [
      { key: 'fleet_operator', label: 'Fleet Operator', description: 'Dispatcher or fleet manager at operations center', default_channel: 'api' },
      { key: 'driver', label: 'Driver', description: 'Vehicle driver reporting issues or requesting info', default_channel: 'telegram' },
      { key: 'maintenance_tech', label: 'Maintenance Tech', description: 'Service technician at depot or external shop' },
      { key: 'compliance_officer', label: 'Compliance Officer', description: 'DOT compliance and safety officer' },
    ],
    default_actor_type: 'fleet_operator',
    admin_roles: ['compliance_officer'],
  },

  skills: [
    { id: 'dispatch-hub', name: 'Dispatch Hub', role: 'gateway', description: 'Central dispatch — triages and routes all fleet requests', entry_channels: ['api', 'telegram', 'email'], connectors: ['fleet-telematics-mcp'] },
    { id: 'fleet-tracker', name: 'Fleet Tracker', role: 'worker', description: 'Real-time vehicle tracking, telemetry, and alerts', connectors: ['fleet-telematics-mcp'] },
    { id: 'route-planner', name: 'Route Planner', role: 'worker', description: 'Route optimization, ETAs, and dynamic re-routing', connectors: ['routing-engine-mcp', 'fleet-telematics-mcp'] },
    { id: 'maintenance-scheduler', name: 'Maintenance Scheduler', role: 'worker', description: 'Work orders, preventive maintenance, and emergency breakdown response', connectors: ['maintenance-db-mcp', 'fleet-telematics-mcp'] },
    { id: 'compliance-safety', name: 'Compliance & Safety', role: 'approval', description: 'DOT compliance, safety audits, and high-cost work order approvals', connectors: ['fleet-telematics-mcp', 'maintenance-db-mcp'] },
  ],

  grants: [
    {
      key: 'fleet.operator_id',
      description: 'Verified fleet operator ID — proves the user is an authorized operator',
      issued_by: ['dispatch-hub'],
      consumed_by: ['fleet-tracker', 'route-planner', 'maintenance-scheduler', 'compliance-safety'],
      issued_via: 'grant_mapping',
      source_tool: 'fleet.operator.verify',
      source_field: '$.operator_id',
      ttl_seconds: 7200,
    },
    {
      key: 'fleet.auth_level',
      description: 'Operator authorization level (L0=viewer, L1=dispatcher, L2=manager)',
      values: ['L0', 'L1', 'L2'],
      issued_by: ['dispatch-hub'],
      consumed_by: ['route-planner', 'maintenance-scheduler', 'compliance-safety'],
      issued_via: 'grant_mapping',
      source_tool: 'fleet.operator.verify',
      source_field: '$.auth_level',
    },
    {
      key: 'fleet.depot',
      description: 'Operator assigned depot — scopes data access to relevant depot',
      issued_by: ['dispatch-hub'],
      consumed_by: ['fleet-tracker', 'route-planner', 'maintenance-scheduler'],
      issued_via: 'grant_mapping',
      source_tool: 'fleet.operator.verify',
      source_field: '$.depot',
      ttl_seconds: 7200,
    },
    {
      key: 'fleet.wo_approved',
      description: 'Approved work order ID — proves a work order was reviewed and approved by compliance',
      issued_by: ['compliance-safety'],
      consumed_by: ['maintenance-scheduler'],
      issued_via: 'grant_mapping',
      source_tool: 'compliance.workorder.review',
      source_field: '$.wo_id',
      ttl_seconds: 86400,
    },
  ],

  handoffs: [
    { id: 'dispatch-to-tracker', from: 'dispatch-hub', to: 'fleet-tracker', trigger: 'Operator verified and intent is vehicle tracking or fleet overview', grants_passed: ['fleet.operator_id', 'fleet.auth_level', 'fleet.depot'], grants_dropped: [], mechanism: 'handoff-controller-mcp' },
    { id: 'dispatch-to-routing', from: 'dispatch-hub', to: 'route-planner', trigger: 'Operator verified and intent is route planning or ETA calculation', grants_passed: ['fleet.operator_id', 'fleet.auth_level', 'fleet.depot'], grants_dropped: [], mechanism: 'handoff-controller-mcp' },
    { id: 'dispatch-to-maintenance', from: 'dispatch-hub', to: 'maintenance-scheduler', trigger: 'Operator verified and intent is maintenance request or vehicle breakdown', grants_passed: ['fleet.operator_id', 'fleet.auth_level', 'fleet.depot'], grants_dropped: [], mechanism: 'handoff-controller-mcp' },
    { id: 'dispatch-to-compliance', from: 'dispatch-hub', to: 'compliance-safety', trigger: 'Operator verified and intent is compliance check or safety audit', grants_passed: ['fleet.operator_id', 'fleet.auth_level', 'fleet.depot'], grants_dropped: [], mechanism: 'handoff-controller-mcp' },
    { id: 'maintenance-to-compliance', from: 'maintenance-scheduler', to: 'compliance-safety', trigger: 'Work order exceeds $5,000 and needs approval', grants_passed: ['fleet.operator_id', 'fleet.auth_level'], grants_dropped: ['fleet.depot'], mechanism: 'handoff-controller-mcp', ttl_seconds: 7200 },
    { id: 'tracker-to-maintenance', from: 'fleet-tracker', to: 'maintenance-scheduler', trigger: 'Engine warning code detected requiring maintenance attention', grants_passed: ['fleet.operator_id', 'fleet.depot'], grants_dropped: [], mechanism: 'internal-message' },
    { id: 'routing-to-compliance', from: 'route-planner', to: 'compliance-safety', trigger: 'Route planning hits driver hours-of-service limit', grants_passed: ['fleet.operator_id', 'fleet.auth_level'], grants_dropped: [], mechanism: 'internal-message' },
  ],

  routing: {
    api: { default_skill: 'dispatch-hub', description: 'API calls from operations center start at Dispatch Hub' },
    telegram: { default_skill: 'dispatch-hub', description: 'Driver messages via Telegram start at Dispatch Hub' },
    email: { default_skill: 'dispatch-hub', description: 'Email requests start at Dispatch Hub' },
  },

  platform_connectors: [
    { id: 'handoff-controller-mcp', required: true, description: 'Platform connector for live conversation handoffs between skills', used_by: ['dispatch-hub', 'fleet-tracker', 'route-planner', 'maintenance-scheduler', 'compliance-safety'] },
  ],

  security_contracts: [
    {
      name: 'Fleet data requires verified operator',
      consumer: 'fleet-tracker',
      provider: 'dispatch-hub',
      requires_grants: ['fleet.operator_id'],
      for_tools: ['telematics.vehicle.status', 'telematics.fleet.search', 'telematics.alerts.list', 'telematics.vehicle.diagnostics'],
      validation: 'Operator must be verified before accessing any fleet telematics data',
    },
    {
      name: 'Route modification requires dispatcher+',
      consumer: 'route-planner',
      provider: 'dispatch-hub',
      requires_grants: ['fleet.operator_id', 'fleet.auth_level'],
      required_values: { 'fleet.auth_level': ['L1', 'L2'] },
      for_tools: ['routing.route.optimize', 'routing.route.reroute'],
      validation: 'Only dispatchers (L1) and managers (L2) can modify routes',
    },
    {
      name: 'Work order creation requires authorized operator',
      consumer: 'maintenance-scheduler',
      provider: 'dispatch-hub',
      requires_grants: ['fleet.operator_id', 'fleet.auth_level'],
      required_values: { 'fleet.auth_level': ['L1', 'L2'] },
      for_tools: ['maintenance.workorder.create', 'maintenance.emergency.dispatch'],
      validation: 'Only dispatchers and managers can create work orders or dispatch emergency service',
    },
    {
      name: 'Work order approval requires compliance review',
      consumer: 'compliance-safety',
      provider: 'dispatch-hub',
      requires_grants: ['fleet.operator_id', 'fleet.auth_level'],
      required_values: { 'fleet.auth_level': ['L2'] },
      for_tools: ['compliance.workorder.review'],
      validation: 'Only managers (L2) can approve/reject work orders through compliance',
    },
    {
      name: 'Driver HOS data is PII-protected',
      consumer: 'compliance-safety',
      provider: 'dispatch-hub',
      requires_grants: ['fleet.operator_id'],
      for_tools: ['compliance.driver.hos'],
      validation: 'Hours-of-service data contains PII and requires verified operator identity',
      response_filter: 'strip-driver-pii',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY
// ═══════════════════════════════════════════════════════════════════════════

async function deploy() {
  console.log('\n=== Deploying Fleet Management Multi-Agent Solution ===\n');
  console.log(`API: ${BASE}`);
  console.log(`Skills: ${skills.length}`);
  console.log(`Connectors: ${connectors.length}`);
  console.log(`Grants: ${solution.grants.length}`);
  console.log(`Handoffs: ${solution.handoffs.length}`);
  console.log(`Security Contracts: ${solution.security_contracts.length}`);
  console.log();

  // First, clean up any existing deployment
  try {
    const cleanResp = await fetch(`${BASE}/deploy/solutions/fleet-management`, {
      method: 'DELETE',
      headers: { 'X-API-KEY': API_KEY, 'X-ADAS-TENANT': 'dev' },
      signal: AbortSignal.timeout(15000),
    });
    if (cleanResp.ok || cleanResp.status === 404) {
      console.log(`  ✓ Cleanup: ${cleanResp.status === 404 ? 'no previous deployment' : 'deleted previous deployment'}`);
    }
  } catch (e) {
    console.log(`  ⚠ Cleanup skipped: ${e.message}`);
  }

  // Deploy
  const body = { solution, skills, connectors };

  console.log('\n── Deploying via POST /deploy/solution ──\n');

  const resp = await fetch(`${BASE}/deploy/solution`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
      'X-ADAS-TENANT': 'dev',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.error(`  ✗ Deploy failed: ${resp.status}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`  Status: ${resp.status}`);
  console.log(`  ok: ${data.ok}`);
  console.log(`  solution_id: ${data.solution_id}`);

  if (data.import) {
    console.log(`  Imported skills: ${data.import.skills?.length || 0}`);
    console.log(`  Imported connectors: ${data.import.connectors?.length || 0}`);
    if (data.import.solution) {
      console.log(`  Solution created: ${data.import.solution.id || data.import.solution.name || 'yes'}`);
    }
  }

  if (data.deploy) {
    const d = data.deploy;
    console.log(`  Skills deployed: ${d.skills_deployed}/${d.skills_total}`);
    console.log(`  Connectors deployed: ${d.connectors_deployed}/${d.connectors_total}`);
  }

  // Verify: read back
  console.log('\n── Verifying deployment ──\n');

  const statusResp = await fetch(`${BASE}/deploy/status/fleet-management`, {
    headers: { 'X-API-KEY': API_KEY, 'X-ADAS-TENANT': 'dev' },
    signal: AbortSignal.timeout(15000),
  });
  const status = await statusResp.json();
  console.log(`  Solution status: ${statusResp.status}`);
  console.log(`  Skills: ${status.skills?.length || 0}`);
  console.log(`  Connectors: ${status.connectors?.length || 0}`);
  console.log(`  ADAS reachable: ${status.adas_reachable}`);

  // Read back definition
  const defResp = await fetch(`${BASE}/deploy/solutions/fleet-management/definition`, {
    headers: { 'X-API-KEY': API_KEY, 'X-ADAS-TENANT': 'dev' },
    signal: AbortSignal.timeout(15000),
  });
  const def = await defResp.json();
  console.log(`  Identity actor_types: ${def.identity?.actor_types?.length || 0}`);
  console.log(`  Grants: ${def.grants?.length || 0}`);
  console.log(`  Handoffs: ${def.handoffs?.length || 0}`);
  console.log(`  Security contracts: ${def.security_contracts?.length || 0}`);

  // List skills
  const skillsResp = await fetch(`${BASE}/deploy/solutions/fleet-management/skills`, {
    headers: { 'X-API-KEY': API_KEY, 'X-ADAS-TENANT': 'dev' },
    signal: AbortSignal.timeout(15000),
  });
  const skillsList = await skillsResp.json();
  console.log(`\n── Deployed Skills ──\n`);
  for (const s of (skillsList.skills || [])) {
    console.log(`  ${s.original_skill_id || s.id} — ${s.name} (tools: ${s.tool_count || '?'})`);
  }

  // Export
  const exportResp = await fetch(`${BASE}/deploy/solutions/fleet-management/export`, {
    headers: { 'X-API-KEY': API_KEY, 'X-ADAS-TENANT': 'dev' },
    signal: AbortSignal.timeout(15000),
  });
  const exportData = await exportResp.json();
  console.log(`\n── Export ──\n`);
  console.log(`  Solution: ${exportData.solution?.name}`);
  console.log(`  Skills in bundle: ${exportData.skills?.length || 0}`);
  console.log(`  Connectors in bundle: ${exportData.connectors?.length || 0}`);
  console.log(`  Exported at: ${exportData.exported_at}`);

  // Summary
  console.log('\n══════════════════════════════════════');
  console.log('  FLEET MANAGEMENT DEPLOYED');
  console.log(`  5 skills • 3 connectors • 4 grants • 7 handoffs`);
  console.log('══════════════════════════════════════\n');
}

deploy().catch(err => {
  console.error('Deploy error:', err);
  process.exit(1);
});

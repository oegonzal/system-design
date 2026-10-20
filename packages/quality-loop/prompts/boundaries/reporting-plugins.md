# Let third parties extend a reporting product with plugins

**Archetype:** plugin-architecture · **Difficulty:** hard

## Scenario

You own a hosted reporting product whose customers want their own data sources, transforms and chart types inside it, without the vendor shipping each one. A plugin is code the vendor did not write; it runs against a customer's data; a report pins the plugin version it was built with; a plugin that misbehaves must be switched off without taking any other plugin, report or customer down. Design where the lines fall between the host, the plugins and the customers' data.

## Functional requirements

1. A developer registers a plugin with a manifest of the capabilities it provides and the data it needs.
2. A customer installs a plugin into their workspace and builds reports with it.
3. A report pins the plugin version it was built with; a new version is adopted per report, never silently.
4. The vendor disables a plugin version for one customer or for all, and the reports that used it say so instead of breaking.
5. A plugin's failures, latency and data access are visible to the vendor per plugin version.

## Domain and data

- Plugin, plugin version, capability and installation are distinct records; an installation ties one version to one customer workspace.
- A report depends on plugin versions by identity; a version is immutable once published.
- A customer's data is never readable by a plugin the customer has not installed.

## Interfaces

- The plugin contract names its inputs, outputs, errors and time limits, and grants no ambient access to anything.
- The host SDK carries a stability promise: what a plugin may call, and how long a call keeps working after a change is announced.
- Installing, disabling and upgrading are commands the host owns; a plugin cannot change its own installation.

## Non-functional requirements

| Kind         | Requirement                                                     | Target |
| ------------ | --------------------------------------------------------------- | ------ |
| availability | A plugin failure never fails the host or another plugin         |        |
| security     | A plugin reads only the data its installation allows            |        |
| cost         | A runaway plugin is stopped before it costs the host its budget |        |

## Decisions to make

- Run plugins in-process, in a sandbox, or on the plugin author's own service — and what each costs in isolation, latency and operability.
- Who owns the schema of a plugin's outputs: the host, so charts stay stable, or the plugin, so it can evolve.
- Curate a marketplace or let any customer install any plugin, and what the review step costs.

## Constraints

- Plugins are untrusted code; nothing the host does may assume otherwise.
- A report must keep rendering, with its last good result marked as such, when its plugin is removed.

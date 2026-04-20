# Custom View Model: Directory Structure View

## Overview

As we continue to refine the early stages of our graph modeling and UI, one of the key concepts is the implementation of a **Custom View Model**. This model embraces the idea of programmable views—leveraging WebAssembly (Wasm), plugins, and other tools, drawing inspiration from extension models like Zellij.

This document captures a specific idea for a custom view that we can refine over time. It is not slated for immediate implementation but serves as a strong example of what the custom view model should support.

## Idea: The Directory Structure View

The core of this idea is to be able to query the graph and render the results in an interactive, hierarchical **directory structure**.

### Use Case Example

Imagine querying a set of **Project** nodes. These projects have various incoming and outgoing relationships, such as:

- **Communication Nodes:** Discussions, updates, or messages attached to the project.
- **Research Nodes:** Findings, notes, or references linked to the project.

Instead of a traditional node-link diagram, this custom view would render the query results like a file system directory.

### User Experience

- **Hierarchy & Relationships:** Users can intuitively see how communication and research nodes are nested under or related to their respective projects.
- **Interactivity:** The view acts as an interactive explorer. Users can easily expand/collapse branches, click on specific nodes (files/folders in the directory metaphor) to view their properties, and seamlessly navigate the graph.
- **Familiarity:** Leveraging the well-understood directory structure metaphor makes complex graph relationships immediately digestible.

## Next Steps

- Collect and iterate on similar custom view ideas.
- Refine the requirements for the programmable view architecture (Wasm/plugins) to ensure it can support this level of custom rendering and interaction.

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { addComponentHistory } from '../database';
import { Project, BOM } from '../../src/types';

const router = express.Router();

// Helper function to convert database row to API format
const mapProjectRow = (row: any): Project => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  startDate: row.start_date,
  completedDate: row.completed_date,
  notes: row.notes,
  tags: row.tags ? JSON.parse(row.tags) : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Get all projects
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
    const rows = stmt.all();
    const projects = rows.map(mapProjectRow);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get project by ID with components
router.get('/:id', (req, res) => {
  try {
    const projectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const project = projectStmt.get(req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project components
    const componentsStmt = db.prepare(`
      SELECT pc.*, c.name, c.part_number, c.category, c.status, c.unit_cost
      FROM project_components pc
      JOIN components c ON pc.component_id = c.id
      WHERE pc.project_id = ?
      ORDER BY c.name ASC
    `);
    const components = componentsStmt.all(req.params.id);

    res.json({ ...(project as any), components });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create new project
router.post('/', (req, res) => {
  try {
    const project: Partial<Project> = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description, status, start_date, completed_date, notes, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      project.name,
      project.description || null,
      project.status || 'planning',
      project.startDate || null,
      project.completedDate || null,
      project.notes || null,
      project.tags ? JSON.stringify(project.tags) : null,
      now,
      now
    );

    // Fetch the created project to return proper format
    const createdStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const createdRow = createdStmt.get(id);
    const newProject = mapProjectRow(createdRow);

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const updates: Partial<Project> = req.body;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        start_date = COALESCE(?, start_date),
        completed_date = COALESCE(?, completed_date),
        notes = COALESCE(?, notes),
        tags = COALESCE(?, tags),
        updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      updates.name,
      updates.description,
      updates.status,
      updates.startDate,
      updates.completedDate,
      updates.notes,
      updates.tags ? JSON.stringify(updates.tags) : undefined,
      now,
      projectId
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch the updated project to return proper format
    const updatedStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const updatedRow = updatedStmt.get(projectId);
    const updatedProject = mapProjectRow(updatedRow);

    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Add component to project
router.post('/:id/components', (req, res) => {
  try {
    const projectId = req.params.id;
    const { componentId, quantityUsed, notes } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    // Check if component exists and has sufficient quantity
    const componentStmt = db.prepare('SELECT * FROM components WHERE id = ?');
    const component: any = componentStmt.get(componentId);
    
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }

    if (component.quantity < quantityUsed) {
      return res.status(400).json({ 
        error: `Insufficient quantity. Available: ${component.quantity}, Requested: ${quantityUsed}` 
      });
    }

    // Add to project components
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO project_components (id, project_id, component_id, quantity_used, notes, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, projectId, componentId, quantityUsed, notes || null, now);

    // Update component quantity and status
    const updateComponentStmt = db.prepare(`
      UPDATE components SET 
        quantity = quantity - ?, 
        status = CASE WHEN quantity - ? <= 0 THEN 'in_use' ELSE status END,
        updated_at = ?
      WHERE id = ?
    `);

    updateComponentStmt.run(quantityUsed, quantityUsed, now, componentId);

    // Add history entry
    addComponentHistory(
      componentId,
      'used',
      undefined,
      `Used ${quantityUsed} in project`,
      quantityUsed,
      projectId
    );

    res.status(201).json({ 
      id, 
      projectId, 
      componentId, 
      quantityUsed, 
      notes, 
      addedAt: now 
    });
  } catch (error) {
    console.error('Error adding component to project:', error);
    res.status(500).json({ error: 'Failed to add component to project' });
  }
});

// Remove component from project
router.delete('/:projectId/components/:componentId', (req, res) => {
  try {
    const { projectId, componentId } = req.params;
    const now = new Date().toISOString();

    // Get current project component info
    const projectComponentStmt = db.prepare(`
      SELECT * FROM project_components 
      WHERE project_id = ? AND component_id = ?
    `);
    const projectComponent: any = projectComponentStmt.get(projectId, componentId);

    if (!projectComponent) {
      return res.status(404).json({ error: 'Component not assigned to this project' });
    }

    // Remove from project
    const deleteStmt = db.prepare(`
      DELETE FROM project_components 
      WHERE project_id = ? AND component_id = ?
    `);
    deleteStmt.run(projectId, componentId);

    // Return quantity to component inventory
    const updateComponentStmt = db.prepare(`
      UPDATE components SET 
        quantity = quantity + ?, 
        status = 'available',
        updated_at = ?
      WHERE id = ?
    `);

    updateComponentStmt.run(projectComponent.quantity_used, now, componentId);

    // Add history entry
    addComponentHistory(
      componentId,
      'returned',
      undefined,
      `Returned ${projectComponent.quantity_used} from project`,
      projectComponent.quantity_used,
      projectId
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing component from project:', error);
    res.status(500).json({ error: 'Failed to remove component from project' });
  }
});

// Generate BOM for project
router.post('/:id/bom', (req, res) => {
  try {
    const projectId = req.params.id;
    const { name } = req.body;
    const bomId = uuidv4();
    const now = new Date().toISOString();

    // Get all components for the project
    const componentsStmt = db.prepare(`
      SELECT pc.component_id, pc.quantity_used, pc.notes, c.name, c.unit_cost
      FROM project_components pc
      JOIN components c ON pc.component_id = c.id
      WHERE pc.project_id = ?
    `);
    
    const projectComponents = componentsStmt.all(projectId);
    
    if (projectComponents.length === 0) {
      return res.status(400).json({ error: 'No components assigned to this project' });
    }

    // Calculate estimated cost
    const estimatedCost = projectComponents.reduce((total: number, comp: any) => {
      const cost = (comp.unit_cost || 0) * comp.quantity_used;
      return total + cost;
    }, 0);

    // Create BOM
    const bomStmt = db.prepare(`
      INSERT INTO boms (id, project_id, name, components, estimated_cost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const bomComponents = projectComponents.map((comp: any) => ({
      componentId: comp.component_id,
      quantity: comp.quantity_used,
      notes: comp.notes
    }));

    bomStmt.run(
      bomId,
      projectId,
      name || `BOM for Project ${projectId.slice(-8)}`,
      JSON.stringify(bomComponents),
      estimatedCost,
      now,
      now
    );

    res.status(201).json({
      id: bomId,
      projectId,
      name,
      components: bomComponents,
      estimatedCost,
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    console.error('Error generating BOM:', error);
    res.status(500).json({ error: 'Failed to generate BOM' });
  }
});

// Get BOMs for project
router.get('/:id/boms', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM boms WHERE project_id = ? ORDER BY created_at DESC');
    const boms = stmt.all(req.params.id);
    
    const bomsWithComponents = boms.map((bom: any) => ({
      ...bom,
      components: JSON.parse(bom.components)
    }));

    res.json(bomsWithComponents);
  } catch (error) {
    console.error('Error fetching BOMs:', error);
    res.status(500).json({ error: 'Failed to fetch BOMs' });
  }
});

// Bulk delete projects with dependency checking
router.post('/bulk-delete', (req, res) => {
  try {
    const { projectIds } = req.body;
    
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: 'No projects specified for deletion' });
    }

    const errors: Array<{ id: string; name: string; error: string; dependencies?: any[] }> = [];
    const successful: string[] = [];

    // Check dependencies for each project
    for (const projectId of projectIds) {
      const projectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
      const project = projectStmt.get(projectId) as any;
      
      if (!project) {
        errors.push({
          id: projectId,
          name: 'Unknown',
          error: 'Project not found'
        });
        continue;
      }

      // Check if project has BOMs
      const bomsStmt = db.prepare('SELECT COUNT(*) as count FROM boms WHERE project_id = ?');
      const bomResult = bomsStmt.get(projectId) as { count: number };

      if (bomResult.count > 0) {
        errors.push({
          id: projectId,
          name: project.name,
          error: 'Cannot delete project with BOMs',
          dependencies: [{
            type: 'boms',
            count: bomResult.count,
            items: [`${bomResult.count} BOM(s)`]
          }]
        });
        continue;
      }

      // Check if project has components assigned
      const componentsStmt = db.prepare(`
        SELECT COUNT(*) as count, GROUP_CONCAT(c.name, ", ") as component_names 
        FROM project_components pc 
        JOIN components c ON pc.component_id = c.id 
        WHERE pc.project_id = ?
      `);
      const componentResult = componentsStmt.get(projectId) as { count: number; component_names: string };

      if (componentResult.count > 0) {
        errors.push({
          id: projectId,
          name: project.name,
          error: 'Cannot delete project with assigned components',
          dependencies: [{
            type: 'components',
            count: componentResult.count,
            items: componentResult.component_names?.split(', ') || []
          }]
        });
        continue;
      }

      // Safe to delete
      try {
        const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');
        const result = deleteStmt.run(projectId);
        
        if (result.changes > 0) {
          successful.push(projectId);
        } else {
          errors.push({
            id: projectId,
            name: project.name,
            error: 'Failed to delete project'
          });
        }
      } catch (deleteError) {
        errors.push({
          id: projectId,
          name: project.name,
          error: 'Database error during deletion'
        });
      }
    }

    res.json({
      successful,
      errors,
      summary: {
        total: projectIds.length,
        deleted: successful.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk delete projects:', error);
    res.status(500).json({ error: 'Failed to process bulk delete' });
  }
});

// Check dependencies for projects (for preview before delete)
router.post('/check-dependencies', (req, res) => {
  try {
    const { projectIds } = req.body;
    
    if (!Array.isArray(projectIds)) {
      return res.status(400).json({ error: 'projectIds must be an array' });
    }

    const results = projectIds.map(projectId => {
      const projectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
      const project = projectStmt.get(projectId) as any;
      
      if (!project) {
        return {
          id: projectId,
          name: 'Unknown',
          canDelete: false,
          dependencies: [],
          error: 'Project not found'
        };
      }

      const dependencies = [];

      // Check BOMs
      const bomsStmt = db.prepare('SELECT COUNT(*) as count FROM boms WHERE project_id = ?');
      const bomResult = bomsStmt.get(projectId) as { count: number };
      
      if (bomResult.count > 0) {
        dependencies.push({
          type: 'boms',
          count: bomResult.count,
          items: [`${bomResult.count} BOM(s)`]
        });
      }

      // Check assigned components
      const componentsStmt = db.prepare(`
        SELECT COUNT(*) as count, GROUP_CONCAT(c.name, ", ") as component_names 
        FROM project_components pc 
        JOIN components c ON pc.component_id = c.id 
        WHERE pc.project_id = ?
      `);
      const componentResult = componentsStmt.get(projectId) as { count: number; component_names: string };
      
      if (componentResult.count > 0) {
        dependencies.push({
          type: 'components',
          count: componentResult.count,
          items: componentResult.component_names?.split(', ').slice(0, 5) || []
        });
      }

      return {
        id: projectId,
        name: project.name,
        canDelete: dependencies.length === 0,
        dependencies
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error checking project dependencies:', error);
    res.status(500).json({ error: 'Failed to check dependencies' });
  }
});

export default router;
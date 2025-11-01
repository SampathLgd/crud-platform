// src/tests/api.test.ts
import request from 'supertest';
import { app } from '../index'; // Import your app
import db = require('../database'); // Import knex

// --- TEST SETUP ---
// We will reset the database before each test
// src/tests/api.test.ts
// src/tests/api.test.ts
beforeAll(async () => {
    // 1. Drop the entire 'public' schema and recreate it
    await db.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    
    // 2. Re-run all migrations on the fresh, empty schema
    await db.migrate.latest(); 
});
// Close the db connection after all tests are done
afterAll(async () => {
    await db.destroy();
});


// --- TEST SUITE ---
describe('Dynamic CRUD Platform API', () => {
    
    let adminToken: string;
    let viewerToken: string;

    // --- 1. Test Auth & Setup ---
    it('should register an Admin user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                email: 'admin@test.com',
                password: 'password123',
                role: 'Admin'
            });
        expect(res.status).toBe(201);
    });
    
    it('should register a Viewer user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                email: 'viewer@test.com',
                password: 'password123',
                role: 'Viewer'
            });
        expect(res.status).toBe(201);
    });

    it('should log in as Admin and get a token', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'admin@test.com',
                password: 'password123'
            });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        adminToken = res.body.token; // Save the token
    });

    it('should log in as Viewer and get a token', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'viewer@test.com',
                password: 'password123'
            });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        viewerToken = res.body.token; // Save the token
    });


    // --- 2. Test RBAC (Evaluation Criterion) ---
    it('should FAIL to publish a model as a Viewer', async () => {
        const testModel = { name: 'FailModel', fields: [{ name: 'test', type: 'string' }], rbac: { Admin: ['all'] } };
        const res = await request(app)
            .post('/api/models/publish')
            .set('Authorization', `Bearer ${viewerToken}`) // Use Viewer token
            .send(testModel);
            
        expect(res.status).toBe(403); // 403 Forbidden
        expect(res.text).toContain('Forbidden');
    });

    // --- 3. Test Dynamic API (Evaluation Criterion) ---
    it('should PASS to publish a model as an Admin', async () => {
        const testModel = {
            name: 'TestProduct',
            fields: [{ name: 'name', type: 'string', required: true }],
            rbac: { Admin: ['all'], Viewer: ['read'] }
        };
        
        const res = await request(app)
            .post('/api/models/publish')
            .set('Authorization', `Bearer ${adminToken}`) // Use Admin token
            .send(testModel);
            
        expect(res.status).toBe(201);
        expect(res.body.message).toContain('Model published successfully');
    });
    
    // --- 4. Test the NEWLY CREATED Endpoint (Hot Reload) ---
    it('should create an item in the new /api/testproduct endpoint', async () => {
        const res = await request(app)
            .post('/api/testproduct') // The new endpoint
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'My First Product' });
            
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('My First Product');
    });
    
    it('should allow a Viewer to read from the new endpoint', async () => {
        const res = await request(app)
            .get('/api/testproduct')
            .set('Authorization', `Bearer ${viewerToken}`); // Use Viewer token
            
        expect(res.status).toBe(200);
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body[0].name).toBe('My First Product');
    });
});
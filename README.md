
# Auto-Generated CRUD + RBAC Platform

This project is a full-stack internal developer platform built for the SDE Assignment. It allows an Admin user to define data models through a web interface. The backend then automatically:
1.  Saves the model definition to a `.json` file.
2.  Creates a new table in the database for that model.
3.  Generates a full set of RBAC-protected CRUD REST APIs for that model, available instantly.

### Tech Stack
* **Backend:** Node.js, Express, TypeScript, Knex.js, PostgreSQL
* **Frontend:** React (run via Babel in-browser), TailwindCSS
* **Auth:** JSON Web Tokens (JWT)

---

## How to Run the App

### 1. Backend Setup

The backend server manages the database, file-writing, and dynamic API generation.

1.  **Navigate to the backend folder:**
    ```bash
    cd crud-platform-backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up PostgreSQL:**
    * Ensure you have PostgreSQL running.
    * Create two databases: `crud_platform` (for development) and `crud_platform_test` (for testing).
    * Update the `knexfile.ts` with your database `user` and `password` for both the `development` and `test` environments.

4.  **Create `.env` file:**
    Create a file named `.env` in the `crud-platform-backend` root folder. This is **required** for the app to run.

    ```.env
    # Server
    PORT=3001
    
    # Auth
    JWT_SECRET=YOUR_SUPER_SECRET_KEY_GOES_HERE
    
    # Frontend URL (for password reset links)
    FRONTEND_URL=[http://127.0.0.1:5501](http://127.0.0.1:5501) 
    
    # Nodemailer (for password reset)
    # Create a Gmail "App Password" for this
    EMAIL_USER=your-email@gmail.com
    EMAIL_PASS=your-gmail-app-password
    ```
    *(Note: `FRONTEND_URL` should match where you serve `index.html`. `http://127.0.0.1:5501` is a common port for the "Live Server" VS Code extension.)*

5.  **Run Database Migrations:**
    This will create the `users` table.
    ```bash
    npx knex migrate:latest
    ```

6.  **Start the Server:**
    This will compile the TypeScript and run the server with `nodemon`.
    ```bash
    npm start
    ```
    The backend will now be running on `http://localhost:3001`.

### 2. Frontend Setup

The frontend is a single `index.html` file that runs React in the browser.

1.  **Open the file:** You can open `index.html` directly in your browser.
2.  **Use Live Server (Recommended):** For the best experience (and to match the default `.env` config), right-click `index.html` in VS Code and select "Open with Live Server".

You can now access the admin panel in your browser.

---

## Dynamic API & RBAC Testing

The project includes an automated test suite (`api.test.ts`) that proves the dynamic API generation and RBAC enforcement works correctly.

To run the tests, use the following command from the `crud-platform-backend` folder:
```bash
npm test
````

### The Test Flow

The test file (`src/tests/api.test.ts`) executes the following flow to validate the system's core features:

1.  **Full Database Reset:** The `beforeAll` hook completely drops and recreates the `public` schema in the **test database** (`crud_platform_test`) and re-runs all migrations. This ensures a perfectly clean slate for every test run.
2.  **Auth Setup:** It registers an "Admin" user and a "Viewer" user and logs them in to get their authentication tokens.
3.  **RBAC Test (Failure Case):** It tests that the "Viewer" user **cannot** publish a new model, proving that the `authorize('Admin')` middleware on the publish endpoint works.
4.  **Dynamic API Test (Success Case):**
      * The "Admin" user **publishes** a new model named `TestProduct`.
      * In the **very next test**, the suite sends a `POST` request to the `/api/testproduct` endpoint—an endpoint that **did not exist when the server started**.
      * It confirms the record was created successfully.
5.  **Dynamic RBAC Test:** The suite then uses the "Viewer" token to send a `GET` request to the new `/api/testproduct` endpoint and confirms it can successfully read the data, as defined in the model's RBAC rules.

This test flow provides automated proof that the API endpoints are created, mounted, and secured *live* on the server at runtime.

-----

## How to Create & Publish a Model

1.  **Register an Admin:**

      * Navigate to the running frontend. You will be on the Login page.
      * Click "Register Here".
      * Sign up with an email and password (e.g., `admin@test.com` / `password123`).
      * Your `RegisterPage` component automatically sends `role: "Admin"`, ensuring your user is an Admin.

2.  **Log In:**

      * Log in with the Admin account you just created.

3.  **Go to Model Definition:**

      * Click "Model Definition" in the sidebar.

4.  **Define the Model:**

      * **Model Name:** `Product`
      * **Table Name:** (optional) `products`
      * **Fields:** Add a few fields, for example:
          * `name` (string, required)
          * `price` (number)
          * `inStock` (boolean, default: true)
      * **RBAC:** Leave as-is (Admins have full access, Viewers can read).

5.  **Publish:**

      * Click the "Publish Model" button.

**That's it\!** You will be redirected to the "Model List". You will now see "Product" in the table. Click "Manage Records" to start adding, editing, and deleting products using the dynamically generated UI.

-----

## How It Works

This platform's core logic is split between **file-writing** and **dynamic routing**.

### 1\. How File-Write Works

This process is handled by the `SchemaService` (`schema.service.ts`).

1.  The frontend POSTs the model definition (a large JSON object) to the `/api/models/publish` endpoint.
2.  This endpoint is protected by `protect` and `authorize('Admin')` middleware.
3.  It calls the `schemaService.publishModel(modelDefinition)` function.
4.  This function first **writes the file** to the disk using `fs.writeFile`. The file is saved in the compiled `dist/models/` directory (e.g., `dist/models/Product.json`).
5.  After the file is saved, it calls `createTableFromDefinition(modelDefinition)` to create the corresponding table in the PostgreSQL database.

### 2\. How Dynamic CRUD Endpoints are Registered

This "hot-reload" routing is handled by the `RouterService` (`router.service.ts`).

**A. On Server Start:**

1.  In `index.ts`, the `startServer` function is called.
2.  It first calls `schemaService.loadModels()`, which reads all `.json` files from the `dist/models/` directory.
3.  It then loops through each model and calls `routerService.registerModelRoutes(model)` for each one.
4.  This ensures that all previously published models are loaded and their APIs are active as soon as the server starts.

**B. On New Model Publish (Hot-Reload):**

1.  When you hit the `/api/models/publish` endpoint, *after* the file is written and the table is created, the controller *also* calls `routerService.registerModelRoutes(modelDefinition)`.
2.  The `registerModelRoutes` function:
      * Gets the model's name (e.g., `Product` -\> `product`).
      * Calls the `createCrudRouter(model, knex)` factory function.
      * This factory creates a **new Express router** with all 5 CRUD endpoints (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`).
      * Each endpoint is wrapped in the `createRbacMiddleware` to enforce the model's specific permissions.
3.  Finally, `routerService` mounts this new router onto the main Express `app` instance:
    ```javascript
    this.app.use(`/api/${tableName}`, router);
    ```
4.  This new API (e.g., `/api/product`) is now **instantly active** on the running server without needing a restart.


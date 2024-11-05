// Sample to-do list data
let todos = [
  {
    id: 1,
    name: "Alice",
    title: "Buy groceries",
    category: "Personal",
    done: false,
  },
  {
    id: 2,
    name: "Bob",
    title: "Prepare presentation",
    category: "Work",
    done: true,
  },
];
let currentCategory = "All";

// Function to render the to-do list table
function renderTable() {
  const todoList = document.getElementById("todo-list");
  todoList.innerHTML = "";

  todos
    .filter(
      (todo) => currentCategory === "All" || todo.category === currentCategory
    )
    .forEach((todo) => {
      const row = document.createElement("tr");

      row.innerHTML = `
            <td>
                <input type="checkbox" ${
                  todo.done ? "checked" : ""
                } onchange="toggleDone(${todo.id})">
            </td>
            <td class="${todo.done ? "done" : ""}">${todo.name}</td>
            <td class="${todo.done ? "done" : ""}">${todo.title}</td>
            <td class="${todo.done ? "done" : ""}">${todo.category}</td>
            <td>
                <button class="btn btn-md" onclick="showModal(${
                  todo.id
                })">
                    <img src="./images/edit.png" alt="Edit" class="icon">
                </button>
                <button class="btn btn-md " onclick="deleteTask(${
                  todo.id
                })">
                    <img src="./images/delete.png" alt="Delete" class="icon">
                </button>
            </td>
        `;

      todoList.appendChild(row);
    });
}

// Function to toggle the 'done' state of a task
function toggleDone(id) {
  const todo = todos.find((todo) => todo.id === id);
  todo.done = !todo.done;
  renderTable();
}

// Function to delete a task
function deleteTask(id) {
  todos = todos.filter((todo) => todo.id !== id);
  renderTable();
}

// Show modal and fill with task data for editing if id is provided
function showModal(id = null) {
  const taskModal = new bootstrap.Modal(document.getElementById("taskModal"));
  document.getElementById("taskModalLabel").textContent = id
    ? "Edit Task"
    : "Add Task";
  document.getElementById("taskId").value = id || "";
  document.getElementById("taskForm").reset();

  if (id) {
    const todo = todos.find((todo) => todo.id === id);
    document.getElementById("taskName").value = todo.name;
    document.getElementById("taskTitle").value = todo.title;
    document.getElementById("taskCategory").value = todo.category;
  }

  taskModal.show();
}

// Function to add or edit a task
document.getElementById("taskForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const id = document.getElementById("taskId").value;
  const name = document.getElementById("taskName").value;
  const title = document.getElementById("taskTitle").value;
  const category = document.getElementById("taskCategory").value;

  if (id) {
    // Edit task
    const todo = todos.find((todo) => todo.id == id);
    todo.name = name;
    todo.title = title;
    todo.category = category;
  } else {
    // Add new task
    todos.push({
      id: Date.now(),
      name,
      title,
      category,
      done: false,
    });
  }

  renderTable();
  bootstrap.Modal.getInstance(document.getElementById("taskModal")).hide();
});

// Filter tasks by category
function filterByCategory(category) {
  currentCategory = category;
  renderTable();
}

// Initial render
renderTable();

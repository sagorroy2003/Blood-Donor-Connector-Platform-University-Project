<br />
<div align="center">
  <a href="https://github.com/sagorroy2003/Blood-Donor-Connector-Platform-University-Project">
    <img src="Frontend/image/NSTU%20BLOOD.png" alt="Blood Connector Logo" width="120" height="120">
  </a>

  <h3 align="center">🩸 Blood Donor Connector Platform</h3>

  <p align="center">
    A modern, full-stack solution connecting blood seekers with eligible donors in real-time.
    <br />
    <br />
    <a href="#-key-features"><strong>Explore the Features »</strong></a>
    <br />
    <br />
    <a href="https://blood-donor-connector-platform-univ.vercel.app">View Frontend Demo</a>
    ·
    <a href="https://blood-donor-backend-mj35.onrender.com">View Backend API</a>
    ·
    <a href="https://github.com/sagorroy2003/Blood-Donor-Connector-Platform-University-Project/issues">Report Bug</a>
  </p>
</div>

<div align="center">
  <img src="https://img.shields.io/github/last-commit/sagorroy2003/Blood-Donor-Connector-Platform-University-Project?style=flat-square" alt="Last Commit">
  <img src="https://img.shields.io/github/issues/sagorroy2003/Blood-Donor-Connector-Platform-University-Project?style=flat-square" alt="Open Issues">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License">
</div>
<br />

---

## 📖 About The Project

This platform addresses the critical need for timely blood donations. It utilizes a distributed cloud architecture to ensure high availability and secure data handling, automating the process of finding eligible donors based on location, blood type, and donation history.



### ✨ Key Features

* 🔐 **Secure Authentication:** JWT-based login with Bcrypt password hashing.
* ✅ **Email Verification:** Automated account activation via **SendGrid**.
* 🧠 **Smart Eligibility Logic:** Filters donors based on a 3-month donation gap.
* 🔔 **Urgent Notifications:** Instant email alerts to eligible donors near the request location.
* 📅 **Date-Specific Requests:** Seekers can specify exactly when blood is needed.
* 🛡️ **Enterprise-Grade Database:** Powered by **TiDB Cloud** (Distributed SQL) with secure SSL connectivity.

---

## 🛠️ Built With

This project leverages a modern, scalable "PERN-ish" stack hosted entirely on the cloud.

| Layer | Technology | Status |
| :--- | :--- | :--- |
| **Frontend** | ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) | Deployed on **Vercel** |
| **Backend** | ![Nodejs](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Expressjs](https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white) | Deployed on **Render** |
| **Database** | ![TiDB](https://img.shields.io/badge/TiDB_Cloud-4476F3?style=flat-square&logo=tidb&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-005C84?style=flat-square&logo=mysql&logoColor=white) | Distributed SQL Cluster |
| **Services** | ![SendGrid](https://img.shields.io/badge/SendGrid-51A9E3?style=flat-square&logo=sendgrid&logoColor=white) ![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white) | Email & Auth |

---

## 📸 Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>User Overview</strong></td>
      <td align="center"><strong>Request Management</strong></td>
    </tr>
    <tr>
      <td><img src="./Frontend/image/dashboard1.png" width="400" alt="Dashboard View 1"></td>
      <td><img src="./Frontend/image/dashboard2.png" width="400" alt="Dashboard View 2"></td>
    </tr>
    <tr>
      <td align="center"><strong>Active Statistics</strong></td>
      <td align="center"><strong>New Request Form</strong></td>
    </tr>
    <tr>
      <td><img src="./Frontend/image/dashboard3.png" width="400" alt="Dashboard View 3"></td>
      <td><img src="./Frontend/image/request%20form.png" width="400" alt="Blood Request Form"></td>
    </tr>
  </table>
  <p><em>Real-time dashboard views and the updated blood request interface.</em></p>
</div>

---

## 🚀 Getting Started

To get a local copy up and running follow these simple steps.

### Prerequisites

* Node.js (v18.x or higher)
* A TiDB Cloud Account (or local MySQL)
* A SendGrid API Key

### Installation

1. **Clone the repo**
    ```sh
    git clone https://github.com/sagorroy2003/Blood-Donor-Connector-Platform-University-Project.git
    ```
2. **Install Backend Packages**
    ```sh
    cd Backend
    npm install
    ```
3. **Configure Environment**
    Create a `.env` file in the `Backend/` root and add your secrets:
    ```env
    DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
    DB_USER=your_tidb_user
    DB_PASSWORD=your_tidb_password
    DB_NAME=blood_connector_db
    DB_PORT=4000
    JWT_SECRET=your_super_secret_key
    SENDGRID_API_KEY=SG.your_sendgrid_key
    SENDGRID_FROM_EMAIL=your_verified_sender_email
    # Ensure CA certificate is present in Backend/certs/
    CA=./certs/isrgrootx1.pem
    VERCEL_FRONTEND_URL=[https://blood-donor-connector-platform-univ.vercel.app](https://blood-donor-connector-platform-univ.vercel.app)
    ```
4. **Run the Server**
    ```sh
    npm start
    ```

---

## 👤 Contact

<div align="center">
  <img src="./Frontend/image/NSTU%20BLOOD.png" alt="Blood Donor NSTU Logo" width="100">
  <br /> 
  <p align="center"> Built with ❤️ to serve the community at <strong>Noakhali Science and Technology University</strong> </p>
  
  <hr width="50%" />

  <p>
    <strong>Sagor Roy</strong> &nbsp;&nbsp; | &nbsp;&nbsp; 
    <a href="https://www.linkedin.com/in/sagorroy2003" target="_blank">
      <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin&logoColor=white" alt="LinkedIn" style="vertical-align: middle;">
    </a>
  </p>

  <p>
    <a href="mailto:sagor2003roy@gmail.com">
      <img src="https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white" alt="Email">
    </a>
    &nbsp;
    <a href="https://www.facebook.com/sagor.roy.956245">
      <img src="https://img.shields.io/badge/Facebook-1877F2?style=flat-square&logo=facebook&logoColor=white" alt="Facebook">
    </a>
  </p>

  <p>
    <strong>Project Link:</strong> <br />
    <a href="https://github.com/sagorroy2003/Blood-Donor-Connector-Platform-University-Project">Blood-Donor-Connector-Platform-University-Project</a>
  </p>
</div>

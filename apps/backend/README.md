# Backend Service (Spring Boot)

小说编辑器云同步后端服务。

## 1. 环境要求 (Prerequisites)
*   **JDK**: Level 17 or higher.
*   **Maven**: 3.6+ (需已安装并配置环境变量).
*   **Database**: MariaDB (默认端口 3306, 数据库名 `novel_editor`).

## 2. 快速开始 (Quick Start)

### 2.1 编译 (Build)
由于使用了阿里云镜像，请务必指定 `settings.xml`：

```powershell
# 在 apps/backend 目录下执行
mvn clean package -s settings.xml
```

### 2.2 运行 (Run)

**方式 A: 直接使用 Maven 插件运行 (推荐开发时使用)**
```powershell
mvn spring-boot:run -s settings.xml
```

**方式 B: 运行打包后的 Jar**
```powershell
java -jar target/backend-0.0.1-SNAPSHOT.jar
```

## 3. 配置说明 (Configuration)
配置文件位于 `src/main/resources/application.yml`。

*   **Database**: 默认连接本地 `jdbc:mariadb://localhost:3306/novel_editor`，用户名 `root`，密码 `123456`。
*   **Server Port**: 默认 `8080`。

## 4. API 文档

### 4.1 认证接口
| 方法 | 路径                 | 说明                     |
| ---- | -------------------- | ------------------------ |
| POST | `/api/auth/login`    | 用户登录，返回 JWT Token |
| POST | `/api/auth/register` | 用户注册                 |

### 4.2 同步接口
| 方法 | 路径             | 说明         |
| ---- | ---------------- | ------------ |
| POST | `/api/sync/push` | 上传增量数据 |
| POST | `/api/sync/pull` | 拉取增量数据 |

### 4.3 文件接口
| 方法 | 路径                  | 说明                 |
| ---- | --------------------- | -------------------- |
| POST | `/api/files/upload`   | 上传文件 (Multipart) |
| GET  | `/api/files/{fileId}` | 下载文件             |

## 5. 项目结构
```
apps/backend/
├── src/main/java/com/noveleditor/
│   ├── controller/    # REST Controllers
│   ├── service/       # Business Logic
│   ├── entity/        # JPA Entities
│   ├── repository/    # Spring Data JPA
│   ├── dto/           # Data Transfer Objects
│   └── config/        # Spring Configuration
├── src/main/resources/
│   └── application.yml
├── pom.xml
└── settings.xml       # Maven 镜像配置
```

## 6. 与桌面端对接
同步协议详见根目录 `SyncDesign.md`。桌面端通过 HTTP 调用本服务的 REST API 进行数据同步。

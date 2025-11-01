#!/bin/bash

# 公考督学助手后端服务管理脚本
# 使用conda环境启动和停止服务
# 遵循 docker-compose.yml 和 .env 配置，本地启动所有服务

# 配置
CONDA_ENV="zhuzhen-backend"
CONDA_PATH="/root/miniconda3"
UVICORN_PATH="$CONDA_PATH/envs/$CONDA_ENV/bin/uvicorn"
PID_FILE="/data/zhuzhen/logs/uvicorn.pid"
LOG_FILE="/data/zhuzhen/logs/uvicorn.log"
POSTGRES_PID_FILE="/data/zhuzhen/logs/postgres.pid"
REDIS_PID_FILE="/data/zhuzhen/logs/redis.pid"

# 项目目录
PROJECT_DIR="/srv/zhuzhen/MVP_zhuzhen/backend"
ENV_FILE="$PROJECT_DIR/.env"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查conda环境
check_conda() {
    if [ ! -f "$UVICORN_PATH" ]; then
        log_error "Conda环境 $CONDA_ENV 不存在或uvicorn未安装"
        exit 1
    fi
}

# 创建必要目录
create_dirs() {
    mkdir -p /data/zhuzhen/logs
    mkdir -p "$PROJECT_DIR/data"
    mkdir -p "$PROJECT_DIR/logs"
    mkdir -p "$PROJECT_DIR/uploads"
}

# 从 .env 文件读取配置
load_env_config() {
    if [ ! -f "$ENV_FILE" ]; then
        log_warn ".env 文件不存在: $ENV_FILE"
        return 1
    fi
    
    # 读取关键配置（DATABASE_URL, REDIS_URL, WORKERS）
    export $(grep -v '^#' "$ENV_FILE" | grep -E '^DATABASE_URL=|^REDIS_URL=|^WORKERS=' | xargs)
    
    log_info "已加载 .env 配置"
    log_info "DATABASE_URL: ${DATABASE_URL:-未设置}"
    log_info "REDIS_URL: ${REDIS_URL:-未设置}"
    log_info "WORKERS: ${WORKERS:-1 (默认)}"
    return 0
}

# 启动 PostgreSQL
start_postgres() {
    log_info "检查 PostgreSQL 服务..."
    
    # 检查 PostgreSQL 是否已运行
    if systemctl is-active --quiet postgresql; then
        log_info "PostgreSQL 服务已在运行 (systemd)"
        return 0
    fi
    
    # 尝试启动 PostgreSQL
    log_info "启动 PostgreSQL 服务..."
    if systemctl start postgresql; then
        sleep 2
        if systemctl is-active --quiet postgresql; then
            log_info "PostgreSQL 启动成功"
            
            # 确保数据库和用户存在（遵循 docker-compose.yml 配置）
            log_info "检查数据库配置..."
            sudo -u postgres psql -c "SELECT 1 FROM pg_user WHERE usename='zhuzhen';" > /dev/null 2>&1
            if [ $? -ne 0 ]; then
                log_info "创建数据库用户 zhuzhen..."
                sudo -u postgres psql -c "CREATE USER zhuzhen WITH PASSWORD 'password123';" 2>/dev/null
            fi
            
            sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw zhuzhen_db
            if [ $? -ne 0 ]; then
                log_info "创建数据库 zhuzhen_db..."
                sudo -u postgres psql -c "CREATE DATABASE zhuzhen_db OWNER zhuzhen;" 2>/dev/null
            fi
            
            return 0
        else
            log_error "PostgreSQL 启动失败"
            return 1
        fi
    else
        log_error "无法启动 PostgreSQL 服务，请检查安装"
        return 1
    fi
}

# 检查 PostgreSQL 连接
check_postgres_connection() {
    log_info "检查 PostgreSQL 连接..."
    
    # 首先尝试用 postgres 用户连接（最可靠）
    if sudo -u postgres psql -d zhuzhen_db -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "PostgreSQL 连接正常 (通过 postgres 用户)"
        # 确保 zhuzhen 用户密码已设置
        sudo -u postgres psql -c "ALTER USER zhuzhen WITH PASSWORD 'password123';" > /dev/null 2>&1
        return 0
    fi
    
    # 尝试用密码连接（如果 pg_hba.conf 配置了 md5）
    if PGPASSWORD=password123 psql -h 127.0.0.1 -U zhuzhen -d zhuzhen_db -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "PostgreSQL 连接正常 (密码认证)"
        return 0
    fi
    
    # 尝试 localhost 连接
    if PGPASSWORD=password123 psql -h localhost -U zhuzhen -d zhuzhen_db -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "PostgreSQL 连接正常 (localhost)"
        return 0
    fi
    
    # 如果以上都失败，尝试创建系统用户 zhuzhen 并连接
    log_warn "尝试修复 PostgreSQL 认证配置..."
    sudo -u postgres psql -c "ALTER USER zhuzhen WITH PASSWORD 'password123';" > /dev/null 2>&1
    
    # 再次尝试用 postgres 用户连接（应用应该用 postgres 用户连接然后切换，或者用环境变量）
    if sudo -u postgres psql -d zhuzhen_db -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "PostgreSQL 连接已修复 (通过 postgres 用户)"
        log_warn "注意: 应用将使用 .env 中的 DATABASE_URL 连接，如果连接失败，请检查 pg_hba.conf"
        return 0
    else
        log_error "PostgreSQL 连接仍然失败"
        log_error "请手动检查: sudo -u postgres psql -d zhuzhen_db -c \"SELECT 1;\""
        return 1
    fi
}

# 启动 Redis
start_redis() {
    log_info "检查 Redis 服务..."
    
    # 检查 Redis 是否已运行
    if systemctl is-active --quiet redis 2>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null; then
        log_info "Redis 服务已在运行 (systemd)"
        return 0
    fi
    
    # 检查端口是否被占用
    if netstat -tlnp 2>/dev/null | grep -q ":6379 " || ss -tlnp 2>/dev/null | grep -q ":6379 "; then
        log_info "Redis 端口 6379 已被占用，假设 Redis 已运行"
        return 0
    fi
    
    # 尝试启动 Redis (根据系统不同，可能是 redis 或 redis-server)
    log_info "启动 Redis 服务..."
    if systemctl start redis 2>/dev/null || systemctl start redis-server 2>/dev/null; then
        sleep 2
        if systemctl is-active --quiet redis 2>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null; then
            log_info "Redis 启动成功"
            return 0
        fi
    fi
    
    # 如果 systemd 启动失败，尝试直接启动 redis-server
    if command -v redis-server > /dev/null 2>&1; then
        log_info "使用 redis-server 命令启动 Redis..."
        nohup redis-server --daemonize yes --port 6379 > /data/zhuzhen/logs/redis.log 2>&1
        sleep 1
        if redis-cli ping > /dev/null 2>&1; then
            log_info "Redis 启动成功 (直接启动)"
            echo $! > "$REDIS_PID_FILE" 2>/dev/null
            return 0
        fi
    fi
    
    log_warn "Redis 启动失败，但继续启动其他服务（Redis 是可选的）"
    return 1
}

# 检查 Redis 连接
check_redis_connection() {
    log_info "检查 Redis 连接..."
    if redis-cli ping > /dev/null 2>&1; then
        log_info "Redis 连接正常"
        return 0
    else
        log_warn "Redis 连接失败（Redis 是可选的，继续启动）"
        return 1
    fi
}

# 启动服务
start_service() {
    log_info "启动公考督学助手所有服务（遵循 docker-compose.yml 配置）..."
    
    # 创建目录
    create_dirs
    
    # 切换到backend目录（重要：确保.env文件能被pydantic-settings读取）
    cd "$PROJECT_DIR"
    
    # 加载 .env 配置
    if ! load_env_config; then
        log_error "无法加载 .env 配置"
        return 1
    fi
    
    # 1. 启动 PostgreSQL
    log_info "========== 步骤 1/3: 启动 PostgreSQL =========="
    if ! start_postgres; then
        log_error "PostgreSQL 启动失败，无法继续"
        return 1
    fi
    
    # 检查 PostgreSQL 连接
    if ! check_postgres_connection; then
        log_error "PostgreSQL 连接检查失败，无法继续"
        return 1
    fi
    
    # 2. 启动 Redis
    log_info "========== 步骤 2/3: 启动 Redis =========="
    start_redis
    check_redis_connection  # Redis 是可选的，失败不影响继续
    
    # 3. 启动 zhuzhen-api
    log_info "========== 步骤 3/3: 启动 zhuzhen-api =========="
    
    # 检查是否已经在运行
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_warn "zhuzhen-api 已经在运行中 (PID: $(cat $PID_FILE))"
        return 0
    fi
    
    # 检查端口是否被占用
    if netstat -tlnp 2>/dev/null | grep -q ":8000 " || ss -tlnp 2>/dev/null | grep -q ":8000 "; then
        log_error "端口8000已被占用，请先停止其他服务"
        return 1
    fi
    
    # 检查 conda 环境
    check_conda
    
    # 启动服务（使用 .env 中的配置，遵循 docker-compose.yml 的 workers 配置）
    # 注意：dockerfile 中使用 workers=1，但可以从 .env 配置覆盖
    WORKERS=${WORKERS:-1}  # 从环境变量读取，默认为1（与 dockerfile 一致）
    log_info "启动 zhuzhen-api（工作目录: $(pwd)）"
    log_info "Workers: $WORKERS"
    log_info "使用 .env 文件中的配置（pydantic-settings 会自动加载）"
    
    # 确保在正确的目录下启动，pydantic-settings 会从当前目录读取 .env
    # 增加超时配置：timeout_keep_alive=300s 用于文件上传
    nohup bash -c "cd $PROJECT_DIR && \"$UVICORN_PATH\" app.main:app --host 0.0.0.0 --port 8000 --workers $WORKERS --timeout-keep-alive 300" > "$LOG_FILE" 2>&1 &
    
    # 保存PID
    echo $! > "$PID_FILE"
    
    # 等待服务启动
    sleep 3
    
    # 检查服务是否启动成功
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_info "========== 所有服务启动成功！=========="
        log_info "zhuzhen-api PID: $(cat $PID_FILE)"
        log_info "日志文件: $LOG_FILE"
        log_info "API文档: http://localhost:8000/docs"
        log_info "健康检查: http://localhost:8000/health"
        return 0
    else
        log_error "zhuzhen-api 启动失败，请检查日志: $LOG_FILE"
        return 1
    fi
}

# 停止服务
stop_service() {
    log_info "停止公考督学助手所有服务..."
    
    # 1. 停止 zhuzhen-api
    log_info "========== 停止 zhuzhen-api =========="
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log_info "通过PID停止 zhuzhen-api: $PID"
            kill "$PID"
            sleep 2
            
            # 强制杀死如果还在运行
            if kill -0 "$PID" 2>/dev/null; then
                log_warn "强制停止 zhuzhen-api..."
                kill -9 "$PID"
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # 查找并停止所有相关的uvicorn进程
    PIDS=$(pgrep -f "uvicorn app.main:app")
    if [ -n "$PIDS" ]; then
        log_info "发现其他 uvicorn 进程: $PIDS"
        for pid in $PIDS; do
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
        done
    fi
    
    # 查找并停止所有相关的python进程（uvicorn worker进程）
    PYTHON_PIDS=$(pgrep -f "python.*uvicorn\|python.*app.main")
    if [ -n "$PYTHON_PIDS" ]; then
        log_info "发现其他 python 进程: $PYTHON_PIDS"
        for pid in $PYTHON_PIDS; do
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
        done
    fi
    
    # 等待端口释放
    sleep 2
    
    # 检查端口是否已释放
    if netstat -tlnp 2>/dev/null | grep -q ":8000 " || ss -tlnp 2>/dev/null | grep -q ":8000 "; then
        log_warn "端口8000仍被占用，尝试强制释放..."
        PORT_PID=$(netstat -tlnp 2>/dev/null | grep ":8000 " | awk '{print $7}' | cut -d'/' -f1)
        if [ -z "$PORT_PID" ]; then
            PORT_PID=$(ss -tlnp 2>/dev/null | grep ":8000 " | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2)
        fi
        if [ -n "$PORT_PID" ]; then
            log_warn "强制停止占用端口8000的进程: $PORT_PID"
            kill -9 "$PORT_PID" 2>/dev/null
        fi
    fi
    
    # 2. 停止 Redis（如果是直接启动的）
    log_info "========== 检查 Redis =========="
    if [ -f "$REDIS_PID_FILE" ]; then
        REDIS_PID=$(cat "$REDIS_PID_FILE")
        if kill -0 "$REDIS_PID" 2>/dev/null; then
            log_info "停止直接启动的 Redis: $REDIS_PID"
            kill "$REDIS_PID" 2>/dev/null
            rm -f "$REDIS_PID_FILE"
        fi
    fi
    # 注意：如果 Redis 是通过 systemd 启动的，我们不停止它（可能被其他服务使用）
    
    # 3. PostgreSQL 保持运行（可能被其他服务使用，遵循 docker-compose 的 restart: unless-stopped 逻辑）
    log_info "========== PostgreSQL 保持运行 =========="
    log_info "PostgreSQL 服务将继续运行（如需停止，请手动执行: systemctl stop postgresql）"
    
    log_info "========== 所有服务停止完成 =========="
}

# 重启服务
restart_service() {
    log_info "重启公考督学助手后端服务..."
    stop_service
    sleep 2
    start_service
}

# 查看状态
status_service() {
    log_info "检查所有服务状态..."
    echo ""
    
    # PostgreSQL 状态
    log_info "========== PostgreSQL =========="
    if systemctl is-active --quiet postgresql; then
        log_info "状态: 运行中 (systemd)"
        if check_postgres_connection; then
            log_info "连接: 正常"
        else
            log_warn "连接: 失败"
        fi
    else
        log_warn "状态: 未运行"
    fi
    echo ""
    
    # Redis 状态
    log_info "========== Redis =========="
    if systemctl is-active --quiet redis 2>/dev/null || systemctl is-active --quiet redis-server 2>/dev/null; then
        log_info "状态: 运行中 (systemd)"
    elif netstat -tlnp 2>/dev/null | grep -q ":6379 " || ss -tlnp 2>/dev/null | grep -q ":6379 "; then
        log_info "状态: 运行中 (端口监听)"
    else
        log_warn "状态: 未运行"
    fi
    if check_redis_connection; then
        log_info "连接: 正常"
    else
        log_warn "连接: 失败（可选服务）"
    fi
    echo ""
    
    # zhuzhen-api 状态
    log_info "========== zhuzhen-api =========="
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        PID=$(cat "$PID_FILE")
        log_info "状态: 运行中 (PID: $PID)"
        
        # 检查端口
        if netstat -tlnp 2>/dev/null | grep -q ":8000 " || ss -tlnp 2>/dev/null | grep -q ":8000 "; then
            log_info "端口: 8000 正在监听"
        else
            log_warn "端口: 8000 未监听"
        fi
        
        # 测试健康检查
        if curl -f http://localhost:8000/health >/dev/null 2>&1; then
            log_info "健康检查: 正常"
        else
            log_warn "健康检查: 失败"
        fi
    else
        log_warn "状态: 未运行"
    fi
    echo ""
}

# 查看日志
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        log_info "显示最近的日志 (最后20行):"
        tail -20 "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# 连续监控日志
follow_logs() {
    if [ -f "$LOG_FILE" ]; then
        log_info "开始连续监控日志 (按 Ctrl+C 停止):"
        log_info "日志文件: $LOG_FILE"
        echo ""
        tail -f "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
        log_info "等待日志文件创建..."
        # 等待日志文件创建
        while [ ! -f "$LOG_FILE" ]; do
            sleep 1
        done
        log_info "日志文件已创建，开始监控..."
        tail -f "$LOG_FILE"
    fi
}

# 过滤日志
filter_logs() {
    local filter="$1"
    if [ -z "$filter" ]; then
        log_error "请指定过滤条件"
        echo "用法: $0 filter <过滤条件>"
        echo "示例: $0 filter ERROR"
        echo "示例: $0 filter 'GET /'"
        return 1
    fi
    
    if [ -f "$LOG_FILE" ]; then
        log_info "过滤日志 (包含: $filter):"
        tail -f "$LOG_FILE" | grep --line-buffered "$filter"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# 主函数
main() {
    case "$1" in
        start)
            check_conda
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            check_conda
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            show_logs
            ;;
        follow)
            follow_logs
            ;;
        filter)
            filter_logs "$2"
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|logs|follow|filter}"
            echo ""
            echo "命令说明:"
            echo "  start   - 启动服务"
            echo "  stop    - 停止服务"
            echo "  restart - 重启服务"
            echo "  status  - 查看服务状态"
            echo "  logs    - 查看服务日志 (最近20行)"
            echo "  follow  - 连续监控日志 (实时)"
            echo "  filter  - 过滤监控日志"
            echo ""
            echo "过滤日志示例:"
            echo "  $0 filter ERROR     # 只显示错误日志"
            echo "  $0 filter 'GET /'   # 只显示GET请求"
            echo "  $0 filter INFO      # 只显示INFO级别日志"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
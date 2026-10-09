#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE="$ROOT/compose.test.yml"
database=${SGI_TEST_DATABASE:-mariadb}
php_version=${SGI_PHP_VERSION:-8.4}
skip_quality=0
include_visual=0
skip_browser=0
simulation_only=0
keep=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --database)
            database=$2
            shift 2
            ;;
        --php-version)
            php_version=$2
            shift 2
            ;;
        --skip-quality)
            skip_quality=1
            shift
            ;;
        --include-visual)
            include_visual=1
            shift
            ;;
        --skip-browser)
            skip_browser=1
            shift
            ;;
        --simulation-only)
            simulation_only=1
            shift
            ;;
        --keep)
            keep=1
            shift
            ;;
        *)
            echo "Opção desconhecida: $1" >&2
            exit 2
            ;;
    esac
done

case "$database" in
    mariadb) database_image=mariadb:10.11 ;;
    mysql) database_image=mysql:8.4 ;;
    *) echo "Banco inválido: $database (use mariadb ou mysql)." >&2; exit 2 ;;
esac

case "$php_version" in
    8.2|8.4) ;;
    *) echo "PHP inválido: $php_version (use 8.2 ou 8.4)." >&2; exit 2 ;;
esac

run_id="$(date -u +%Y%m%d_%H%M%S)-$$"
run_id_safe="$(printf '%s' "$run_id" | tr '-' '_')"
project_name="sgi-test-$run_id"
database_name="sgi_test_$run_id_safe"
results_directory="$ROOT/test-results/docker-$run_id"
browser_results_directory="$ROOT/tests/browser/test-results/docker-$run_id"
browser_report_directory="$ROOT/tests/browser/playwright-report/docker-$run_id"
mkdir -p "$results_directory" "$browser_results_directory" "$browser_report_directory"
run_started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
run_started_seconds=$(date -u '+%s')
steps_json='[]'
exit_code=0
json_report_path="$results_directory/browser-playwright.json"

export COMPOSE_PROJECT_NAME="$project_name"
export SGI_DB_IMAGE="$database_image" SGI_PHP_VERSION="$php_version"
export SGI_DB_PASSWORD=sgi-test-only SGI_TEST_DB_NAME="$database_name"
export SGI_TEST_RUN_ID="$run_id"
export SGI_SIMULATION_RUN_ID="$run_id"
export SGI_SIMULATION_PHASE=complete SGI_TEST_PRESERVE_DATABASE=0
export SGI_TEST_HOST_PORT="${SGI_TEST_HOST_PORT:-0}"
export SGI_TEST_RESULTS_DIR="$results_directory"
export SGI_TEST_BROWSER_RESULTS_DIR="$browser_results_directory"
export SGI_TEST_BROWSER_REPORT_DIR="$browser_report_directory"
export SGI_BROWSER_OUTPUT_DIR=/app/tests/browser/test-results
export SGI_BROWSER_REPORT_DIR=/app/tests/browser/playwright-report
export SGI_BROWSER_JSON_REPORT=/app/test-results/browser-playwright.json
export SGI_INDIVIDUAL_BROWSER=1
if [ "$simulation_only" -eq 1 ]; then
    export SGI_TEST_INTEGRATION_SCENARIO=FullInterclasseSimulationTest
    export SGI_TEST_DEFER_SIMULATION=0
else
    export SGI_TEST_INTEGRATION_SCENARIO=
    export SGI_TEST_DEFER_SIMULATION=1
fi

compose() {
    docker compose --project-name "$project_name" -f "$COMPOSE_FILE" "$@"
}

run_step() {
    step_name=$1
    shift
    step_started=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    step_start_seconds=$(date -u '+%s')
    if "$@"; then
        step_status=passed
        step_exit=0
    else
        step_exit=$?
        step_status=failed
    fi
    step_end_seconds=$(date -u '+%s')
    step_duration=$((step_end_seconds - step_start_seconds))
    step_json=$(printf '{"name":"%s","started_at_utc":"%s","duration_seconds":%s,"status":"%s","exit_code":%s}' \
        "$step_name" "$step_started" "$step_duration" "$step_status" "$step_exit")
    if [ "$steps_json" = '[]' ]; then
        steps_json="[$step_json]"
    else
        steps_json="${steps_json%]},$step_json]"
    fi
    if [ "$step_exit" -ne 0 ]; then return "$step_exit"; fi
}

write_manifest() {
    manifest_status=$1
    revision=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)
    dirty=null
    if git -C "$ROOT" status --porcelain >/dev/null 2>&1; then
        if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then dirty=true; else dirty=false; fi
    fi
    now_seconds=$(date -u '+%s')
    duration=$((now_seconds - run_started_seconds))
    reports_json='[]'
    if [ -f "$json_report_path" ]; then reports_json='["browser-playwright.json"]'; fi
    if [ -f "$results_directory/simulation-browser-playwright.json" ]; then
        if [ "$reports_json" = '[]' ]; then reports_json='["simulation-browser-playwright.json"]'; else reports_json="${reports_json%]},\"simulation-browser-playwright.json\"]"; fi
    fi
    if [ "$include_visual" -eq 1 ] && [ -f "$results_directory/visual-playwright.json" ]; then
        if [ "$reports_json" = '[]' ]; then reports_json='["visual-playwright.json"]'; else reports_json="${reports_json%]},\"visual-playwright.json\"]"; fi
    fi
    integration_scenario_filter=false
    if [ -n "${SGI_TEST_INTEGRATION_SCENARIO:-}" ]; then integration_scenario_filter=true; fi
    printf '{"schema_version":1,"run_id":"%s","runner":"docker-compose-shell","database":"%s","database_image":"%s","php_version":"%s","revision":"%s","working_tree_dirty":%s,"started_at_utc":"%s","finished_at_utc":"%s","duration_seconds":%s,"exit_code":%s,"selection":{"quality":%s,"integration":%s,"integration_scenario_filter":%s,"simulation_only":%s,"simulation_portal_browser":%s,"browser":%s,"visual":%s,"environment_kept":%s},"integration_timings_json":"%s/integration-timings.json","simulation_integration_timings_json":"%s/simulation-integration-timings.json","playwright_json":%s,"steps":%s}\n' \
        "$run_id" "$database" "$database_image" "$php_version" "$revision" "$dirty" "$run_started_at" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$duration" "$manifest_status" \
        "$([ "$skip_quality" -eq 0 ] && echo true || echo false)" "$([ "$simulation_only" -eq 0 ] && echo true || echo false)" "$integration_scenario_filter" "$([ "$simulation_only" -eq 1 ] && echo true || echo false)" "$([ "$skip_browser" -eq 0 ] && echo true || echo false)" "$([ "$skip_browser" -eq 0 ] && echo true || echo false)" "$([ "$include_visual" -eq 1 ] && echo true || echo false)" "$([ "$keep" -eq 1 ] && echo true || echo false)" \
        "$results_directory" "$results_directory" "$reports_json" "$steps_json" \
        > "$results_directory/run-manifest.json"
}

cleanup() {
    status=$?
    if [ "$keep" -eq 0 ]; then
        compose logs --no-color app db > "$results_directory/docker-compose.log" || true
        cleanup_started=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        cleanup_start_seconds=$(date -u '+%s')
        if compose down --volumes --remove-orphans; then cleanup_exit=0; else cleanup_exit=$?; fi
        if [ "$cleanup_exit" -ne 0 ]; then
            if [ "$status" -eq 0 ]; then status=1; fi
            echo 'Não foi possível remover completamente o ambiente Docker de teste.' >&2
        fi
        cleanup_duration=$(($(date -u '+%s') - cleanup_start_seconds))
        cleanup_step=$(printf '{"name":"cleanup","started_at_utc":"%s","duration_seconds":%s,"status":"%s","exit_code":%s}' \
            "$cleanup_started" "$cleanup_duration" "$([ "$cleanup_exit" -eq 0 ] && echo passed || echo failed)" "$cleanup_exit")
        if [ "$steps_json" = '[]' ]; then steps_json="[$cleanup_step]"; else steps_json="${steps_json%]},$cleanup_step]"; fi
    else
        echo 'Ambiente mantido conforme solicitado (--keep).'
        cleanup_started=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        cleanup_step=$(printf '{"name":"cleanup","started_at_utc":"%s","duration_seconds":0,"status":"retained_by_request","exit_code":0}' "$cleanup_started")
        if [ "$steps_json" = '[]' ]; then steps_json="[$cleanup_step]"; else steps_json="${steps_json%]},$cleanup_step]"; fi
    fi
    exit_code=$status
    write_manifest "$status"
    exit "$status"
}
trap cleanup EXIT

run_step 'compose config --quiet' compose config --quiet
build_services="app"
if [ "$skip_browser" -eq 0 ] || [ "$include_visual" -eq 1 ]; then
    build_services="$build_services browser"
fi
# shellcheck disable=SC2086
run_step "compose build $build_services" compose build $build_services
if [ "$skip_quality" -eq 0 ]; then
    run_step 'quality' compose run --rm --no-deps quality
fi
run_step 'server and database startup' compose up -d --wait db app
if [ "$simulation_only" -eq 0 ]; then
    run_step 'integration' compose run --rm --no-deps integration
fi

if [ "$simulation_only" -eq 0 ] && { [ "$skip_browser" -eq 0 ] || [ "$include_visual" -eq 1 ]; }; then
    run_step 'restore latest schema before browser' compose run --rm --no-deps integration php bin/sgi.php migrate
fi

if [ "$simulation_only" -eq 0 ] && [ "$skip_browser" -eq 0 ]; then
    run_step 'browser' compose run --rm --no-deps browser
fi

if [ "$simulation_only" -eq 0 ] && [ "$include_visual" -eq 1 ]; then
    export SGI_BROWSER_JSON_REPORT=/app/test-results/visual-playwright.json
    run_step 'visual' compose run --rm --no-deps visual
fi

if [ "$simulation_only" -eq 0 ]; then
    export SGI_TEST_INTEGRATION_SCENARIO=FullInterclasseSimulationTest
    export SGI_TEST_DEFER_SIMULATION=0
fi
export SGI_BROWSER_JSON_REPORT=/app/test-results/simulation-browser-playwright.json
if [ "$skip_browser" -eq 0 ]; then export SGI_SIMULATION_PHASE=prepare; else export SGI_SIMULATION_PHASE=complete; fi
run_step 'simulation integration' compose run --rm --no-deps integration
if [ "$skip_browser" -eq 0 ]; then
    export SGI_BROWSER_JSON_REPORT=/app/test-results/simulation-events-playwright.json
    run_step 'simulation events via mesario browser' compose run --rm --no-deps browser-simulation-events
    export SGI_SIMULATION_PHASE=finalize SGI_TEST_PRESERVE_DATABASE=1
    export SGI_BROWSER_JSON_REPORT=/app/test-results/simulation-browser-playwright.json
    run_step 'simulation final reconciliation' compose run --rm --no-deps integration
    export SGI_TEST_PRESERVE_DATABASE=0 SGI_SIMULATION_PHASE=complete
    run_step 'simulation portal' compose run --rm --no-deps browser-simulation
fi

echo 'Todos os serviços de teste concluíram com sucesso.'

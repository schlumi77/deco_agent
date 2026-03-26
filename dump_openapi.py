import json
from fastapi.openapi.utils import get_openapi
from api.main import app

def generate_openapi():
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )
    with open("openapi.json", "w") as f:
        json.dump(openapi_schema, f, indent=2)

if __name__ == "__main__":
    generate_openapi()
    print("OpenAPI schema generated at openapi.json")

FROM aitfs.jac.mil.ae:8082/python:3.12-windowsservercore-ltsc2022

WORKDIR C:\\app

COPY requirements.txt .
RUN pip install --no-cache-dir --trusted-host aitfs.jac.mil.ae --index-url http://aitfs.jac.mil.ae:9081/repository/esnaad-pypy/simple/ -r requirements.txt

COPY . .

EXPOSE 8000

SHELL ["cmd", "/S", "/C"]
ENTRYPOINT ["cmd", "/C", "entrypoint.cmd"]

<svelte:head>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const currentPath = `${fileTable.dataset['root']}`.replace('//?$/', '/');
      const refreshContainer = document.getElementById('refreshContainer');
      const refresh = document.getElementById('refresh');
      const tasksContainer = document.getElementById('tasksContainer');
      const tasks = document.getElementById('tasks');
      let requests = [];

      /**
       * Make Directory
       */
      handleMkdirs: {
        const mkdirContainer = document.getElementById('mkdirContainer');
        mkdirContainer.style.display = '';
        const mkdirForm = document.getElementById('mkdir');

        mkdirForm.addEventListener('submit', (event) => {
          event.preventDefault();
          requests = requests.concat([
            {
              type: 'mkdir',
              done: null,
              name: mkdirForm.name.value,
            },
          ]);
          mkdirForm.reset();

          doMkdir();
        });

        function doMkdir() {
          for (let i = 0; i < requests.length; i++) {
            const dir = requests[i];

            if (dir.type === 'mkdir' && dir.done === null) {
              dir.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Make directory ${dir.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                dir.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('MKCOL', dir.name, true);
              xhr.send();
            }
          }
        }
      }

      /**
       * File Upload
       */
      handleUploads: {
        const uploadContainer = document.getElementById('uploadContainer');
        uploadContainer.style.display = '';
        const uploadForm = document.getElementById('upload');

        uploadForm.addEventListener('submit', (event) => {
          event.preventDefault();
          requests = requests.concat(
            Array.prototype.slice.call(uploadForm.file.files).map((file) => ({
              type: 'upload',
              done: null,
              file,
            }))
          );
          uploadForm.reset();

          doUpload();
        });

        function doUpload() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'upload' && file.done === null) {
              file.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('label');
              element.style.display = 'block';
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('progress');
              progress.value = 0;
              progress.max = 100;
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Upload ${file.file.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                  progress.value = (event.loaded / event.total) * 100;
                  progress.title = (event.loaded / event.total) * 100 + '%';
                }
              });
              xhr.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                  progress.value = (event.loaded / event.total) * 100;
                  progress.title = (event.loaded / event.total) * 100 + '%';
                }
              });
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.value = 100;
                  progress.title = 'Done';
                } else {
                  progress.value = 0;
                  progress.title = 'Error';
                  const error = document.createElement('span');
                  error.innerText = ` (Error: ${xhr.status} ${xhr.statusText})`;
                  element.appendChild(error);
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('PUT', file.file.name, true);
              xhr.setRequestHeader('Content-Type', file.file.type);
              xhr.send(file.file);
            }
          }
        }
      }

      /**
       * Show Actions
       */
      const actions = document.querySelectorAll('.action');

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        action.style.display = '';
      }

      /**
       * Rename
       */
      handleCopyMoves: {
        const fileTable = document.getElementById('fileTable');
        const filenames = Array.prototype.slice
          .call(fileTable.querySelectorAll('.filename'))
          .map((el) => el.innerText);
        const copymoveContainer = document.getElementById('copymoveContainer');
        const copymoveSelected = document.getElementById('copymoveSelected');
        const copymoveActions = document.getElementById('copymoveActions');
        const copyButton = document.getElementById('copyButton');
        const moveButton = document.getElementById('moveButton');
        const unselectButton = document.getElementById('unselectButton');

        function getCookie(cname) {
          let name = cname + '=';
          let decodedCookie = decodeURIComponent(document.cookie);
          let ca = decodedCookie.split(';');
          for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
              c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
              return c.substring(name.length, c.length);
            }
          }
          return '';
        }

        function checkCopyMoveCookie() {
          const selectedPath = getCookie('nephele-selected-path');
          const selectedFile = getCookie('nephele-selected-file');

          if (selectedPath != '' && selectedFile != '') {
            copymoveContainer.style.display = '';
            copymoveSelected.innerText = selectedFile;

            if (selectedPath === currentPath) {
              copyButton.innerText = 'Duplicate Here';
              moveButton.disabled = true;
            } else {
              copyButton.innerText = 'Copy Here';
              moveButton.disabled = false;
            }
          } else {
            copymoveContainer.style.display = 'none';
          }
        }
        checkCopyMoveCookie();

        function clearCookies() {
          document.cookie = `nephele-selected-path=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
          document.cookie = `nephele-selected-file=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        }

        function fileExists(filename) {
          return (
            filenames.indexOf(filename.replace(/\/?$/, '')) !== -1 ||
            filenames.indexOf(filename.replace(/\/?$/, '/')) !== -1
          );
        }

        function getDuplicateFilename(filename) {
          let i = 0;
          let newFilename = '';
          do {
            i++;
            const ext = (filename.match(/(\/|\..*)$/) || [''])[0];
            newFilename = `${filename.substring(
              0,
              filename.length - ext.length
            )} (${i})${ext}`;
          } while (fileExists(newFilename));
          return newFilename;
        }

        fileTable.addEventListener('click', (event) => {
          if (!event.target.classList.contains('copymove')) {
            return;
          }

          event.preventDefault();

          document.cookie = `nephele-selected-path=${escape(
            currentPath
          )}; path=/`;
          document.cookie = `nephele-selected-file=${escape(
            event.target.parentNode.dataset['name']
          )}; path=/`;
          checkCopyMoveCookie();
        });

        copyButton.addEventListener('click', (event) => {
          const selectedPath = getCookie('nephele-selected-path');
          const selectedFile = getCookie('nephele-selected-file');
          const destinationPath = currentPath;
          let destinationFile = selectedFile;

          event.preventDefault();

          if (selectedPath === '' || selectedFile === '') {
            return;
          }

          if (selectedPath === destinationPath) {
            destinationFile = getDuplicateFilename(destinationFile);
          }

          if (
            fileExists(destinationFile) &&
            !confirm('The destination exists. Would you like to overwrite it?')
          ) {
            return;
          }

          requests = requests.concat([
            {
              type: 'copy',
              done: null,
              name: selectedFile,
              source: `${selectedPath.replace(/\/?$/, '/')}${encodeURIComponent(
                selectedFile
              )}`,
              destination: `${destinationPath.replace(
                /\/?$/,
                '/'
              )}${encodeURIComponent(destinationFile)}`,
            },
          ]);

          doCopy();

          clearCookies();
          checkCopyMoveCookie();
        });

        moveButton.addEventListener('click', (event) => {
          const selectedPath = getCookie('nephele-selected-path');
          const selectedFile = getCookie('nephele-selected-file');
          const destinationPath = currentPath;
          let destinationFile = selectedFile;

          event.preventDefault();

          if (selectedPath === '' || selectedFile === '') {
            return;
          }

          if (selectedPath === destinationPath) {
            return;
          }

          if (
            fileExists(destinationFile) &&
            !confirm('The destination exists. Would you like to overwrite it?')
          ) {
            return;
          }

          requests = requests.concat([
            {
              type: 'move',
              done: null,
              name: selectedFile,
              source: `${selectedPath.replace(/\/?$/, '/')}${encodeURIComponent(
                selectedFile
              )}`,
              destination: `${destinationPath.replace(
                /\/?$/,
                '/'
              )}${encodeURIComponent(destinationFile)}`,
            },
          ]);

          doMove();

          clearCookies();
          checkCopyMoveCookie();
        });

        unselectButton.addEventListener('click', (event) => {
          event.preventDefault();

          clearCookies();
          checkCopyMoveCookie();
        });

        function doCopy() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'copy' && file.done === null) {
              file.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Copy ${file.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('COPY', file.source, true);
              xhr.setRequestHeader('Destination', file.destination);
              xhr.send();
            }
          }
        }

        function doMove() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'move' && file.done === null) {
              file.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Move ${file.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('MOVE', file.source, true);
              xhr.setRequestHeader('Destination', file.destination);
              xhr.send();
            }
          }
        }
      }

      /**
       * Rename
       */
      handleRenames: {
        const fileTable = document.getElementById('fileTable');

        fileTable.addEventListener('click', (event) => {
          if (!event.target.classList.contains('rename')) {
            return;
          }

          event.preventDefault();

          const newName = prompt(
            'Enter the new name.',
            event.target.parentNode.dataset['name']
          );
          if (newName == null || newName == '') {
            return;
          }

          requests = requests.concat([
            {
              type: 'rename',
              done: null,
              name: event.target.parentNode.dataset['name'],
              newName,
            },
          ]);

          doRename();
        });

        function doRename() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'rename' && file.done === null) {
              file.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Rename ${file.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('MOVE', file.name, true);
              xhr.setRequestHeader(
                'Destination',
                currentPath + encodeURIComponent(file.newName)
              );
              xhr.send();
            }
          }
        }
      }

      /**
       * Delete
       */
      handleDeletes: {
        const fileTable = document.getElementById('fileTable');

        fileTable.addEventListener('click', (event) => {
          if (!event.target.classList.contains('delete')) {
            return;
          }

          event.preventDefault();

          if (
            !confirm(
              `Are you sure you want to delete "${
                event.target.parentNode.dataset['name']
              }"?${
                event.target.parentNode.dataset['name'].match(/\/$/)
                  ? ' This will delete all of its contents too.'
                  : ''
              }`
            )
          ) {
            return;
          }

          requests = requests.concat([
            {
              type: 'delete',
              done: null,
              name: event.target.parentNode.dataset['name'],
            },
          ]);

          doDelete();
        });

        function doDelete() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'delete' && file.done === null) {
              file.done = false;
              tasksContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = `Delete ${file.name}`;
              element.appendChild(name);

              tasks.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('DELETE', file.name, true);
              xhr.send();
            }
          }
        }
      }
    });
  </script>
</svelte:head>

<h1>
  Index of {decodeURIComponent(self.url.pathname)}
</h1>

<table id="fileTable" style="width: 100%;" cellspacing="0" data-root={self.url}>
  <thead>
    <tr>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=name&amp;order={(urlParams.order === 'asc' &&
            urlParams.sort === 'name') ||
          !('sort' in urlParams)
            ? 'desc'
            : 'asc'}"
        >
          Name
        </a>
        {#if urlParams.sort === 'name' || !('sort' in urlParams)}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=type&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'type'
            ? 'desc'
            : 'asc'}"
        >
          Type
        </a>
        {#if urlParams.sort === 'type'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=modified&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'modified'
            ? 'desc'
            : 'asc'}"
        >
          Last Modified
        </a>
        {#if urlParams.sort === 'modified'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=size&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'size'
            ? 'desc'
            : 'asc'}"
        >
          Size
        </a>
        {#if urlParams.sort === 'size'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th
        class="action"
        style="text-align: left; border-bottom: 1px solid #ddd; display: none;"
        >Actions</th
      >
    </tr>
  </thead>
  <tbody>
    {#if self.url.pathname != '/'}
      <tr>
        <td
          ><a href="{`${self.url.pathname}`.replace(/\/[^\/]*\/?$/, '')}/">..</a
          ></td
        >
        <td />
        <td />
        <td>Parent Directory</td>
        <td class="action" style="display: none;" />
      </tr>
    {/if}
    {#each sortEntries() as entry, i (entry.name)}
      <tr
        style={(self.url.pathname != '/' ? !(i % 2) : i % 2)
          ? 'background-color: #ddd;'
          : ''}
      >
        <td
          ><a class="filename" href={entry.url}
            >{entry.name}{entry.directory ? '/' : ''}</a
          ></td
        >
        <td>{entry.directory ? 'Directory' : entry.type}</td>
        <td>{new Date(entry.lastModified).toLocaleString()}</td>
        <td title={entry.directory ? '' : `${entry.size} bytes`}
          >{entry.directory ? '' : prettySize(entry.size)}</td
        >
        <td
          class="action"
          style="width: 1px; white-space: nowrap; display: none;"
          data-name={`${entry.name}${entry.directory ? '/' : ''}`}
        >
          <button class="copymove">Copy/Move</button>
          <button class="rename">Rename</button>
          <button class="delete">Delete</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<div id="copymoveContainer" style="margin-top: 1em; display: none;">
  Selected: <code id="copymoveSelected" />

  <div>
    <button id="copyButton" class="copy">Copy Here</button>
    <button id="moveButton" class="move">Move Here</button>
    <button id="unselectButton" class="unselect">Unselect</button>
  </div>
</div>

<div id="mkdirContainer" style="margin-top: 1em; display: none;">
  <form name="mkdir" id="mkdir">
    New Directory: <input type="text" name="name" placeholder="Name" />
    <button>Submit</button>
  </form>
</div>

<div id="uploadContainer" style="margin-top: 1em; display: none;">
  <form name="upload" id="upload">
    Upload: <input type="file" name="file" multiple />
    <button>Submit</button>
  </form>
</div>

<div id="tasksContainer" style="margin-top: 1em; display: none;">
  Tasks

  <div id="tasks" />
</div>

<div id="refreshContainer" style="margin-top: 1em; display: none;">
  <button id="refresh" onclick="window.location.reload()">Refresh</button>
</div>

<hr />
<p style="font-size: smaller; text-align: right;">Served by {name}</p>

<script>
  export let entries = [];
  export let self;
  export let urlParams;
  export let name;

  function sortEntries() {
    return entries.sort((a, b) => {
      if (a.directory && !b.directory) {
        return -1;
      } else if (b.directory && !a.directory) {
        return 1;
      }

      switch (urlParams.sort) {
        case 'name':
        default:
          return urlParams.order === 'desc'
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
        case 'type':
          if (a.directory) {
            return urlParams.order === 'desc'
              ? b.name.localeCompare(a.name)
              : a.name.localeCompare(b.name);
          }
          return urlParams.order === 'desc'
            ? b.type.localeCompare(a.type)
            : a.type.localeCompare(b.type);
        case 'modified':
          return urlParams.order === 'desc'
            ? b.lastModified - a.lastModified
            : a.lastModified - b.lastModified;
        case 'size':
          if (a.directory) {
            return urlParams.order === 'desc'
              ? b.name.localeCompare(a.name)
              : a.name.localeCompare(b.name);
          }
          return urlParams.order === 'desc' ? b.size - a.size : a.size - b.size;
      }
    });
  }

  function prettySize(size) {
    return `${prettySizeDecimal(size)} (${prettySizeBinary(size)})`;
  }

  function prettySizeDecimal(size) {
    const KB = 1000;
    const MB = KB * 1000;
    const GB = MB * 1000;
    const TB = GB * 1000;

    if (size > TB) {
      return `${Math.round((size / TB) * 100) / 100}TB`;
    } else if (size > GB) {
      return `${Math.round((size / GB) * 100) / 100}GB`;
    } else if (size > MB) {
      return `${Math.round((size / MB) * 100) / 100}MB`;
    } else if (size > KB) {
      return `${Math.round((size / KB) * 100) / 100}KB`;
    } else {
      return `${size}B`;
    }
  }

  function prettySizeBinary(size) {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;

    if (size > TB) {
      return `${Math.round((size / TB) * 100) / 100}TiB`;
    } else if (size > GB) {
      return `${Math.round((size / GB) * 100) / 100}GiB`;
    } else if (size > MB) {
      return `${Math.round((size / MB) * 100) / 100}MiB`;
    } else if (size > KB) {
      return `${Math.round((size / KB) * 100) / 100}KiB`;
    } else {
      return `${size}B`;
    }
  }
</script>
